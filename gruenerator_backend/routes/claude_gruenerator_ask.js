import express from 'express';
import authMiddlewareModule from '../middleware/authMiddleware.js';
import { vectorSearchService } from '../services/vectorSearchService.js';
import passport from '../config/passportSetup.mjs';
import { 
  MARKDOWN_FORMATTING_INSTRUCTIONS, 
  SEARCH_DOCUMENTS_TOOL, 
  extractCitationsFromText, 
  processAIResponseWithCitations 
} from '../utils/promptUtils.js';

const { requireAuth: ensureAuthenticated } = authMiddlewareModule;
const router = express.Router();



// Add Passport session middleware
router.use(passport.session());

router.post('/', ensureAuthenticated, async (req, res) => {
  try {
    const { question, group_id } = req.body;

    if (!question || question.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Question is required'
      });
    }

    console.log(`[claude_gruenerator_ask] Processing question for user ${req.user.id}:`, question.substring(0, 100));

    // Tool-use approach: Let Claude search documents dynamically
    const result = await handleQuestionWithTools(question, req.user.id, group_id, req.app.locals.aiWorkerPool);
    
    res.json(result);

  } catch (error) {
    console.error('[claude_gruenerator_ask] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to process question'
    });
  }
});

/**
 * Handle question using tool-use approach where Claude can search documents multiple times
 */
async function handleQuestionWithTools(question, userId, groupId, aiWorkerPool) {
  console.log('[claude_gruenerator_ask] Starting tool-use conversation');
  
  // System prompt for tool-guided document analysis
  const systemPrompt = `Du bist ein Experte für Dokumentenanalyse mit Zugang zu einer Dokumentensuchfunktion. 

Deine Aufgabe:
1. Verwende das search_documents Tool, um relevante Dokumente zu finden
2. Du kannst mehrere Suchen mit verschiedenen Begriffen durchführen
3. Sammle umfassende Informationen bevor du antwortest
4. Erstelle Zitate aus den gefundenen Dokumenten

Zitat-Format:
- Finde die relevantesten Textstellen für deine Antwort
- Format: [1] "Exakter Text aus dem Dokument" (Dokument: Titel)
- Nummeriere Zitate fortlaufend

Antwort-Struktur:
1. Beginne mit "Hier sind die relevanten Zitate:"
2. Liste alle Zitate auf
3. Dann schreibe "Antwort:" und beantworte die Frage
4. Referenziere Zitate in der Antwort mit [1], [2] etc.

${MARKDOWN_FORMATTING_INSTRUCTIONS}`;

  // Initial conversation state
  let messages = [{
    role: "user",
    content: question
  }];
  
  let allSearchResults = [];
  let searchCount = 0;
  const maxSearches = 5; // Prevent infinite loops
  
  console.log('[claude_gruenerator_ask] Starting conversation with tools');
  
  // Conversation loop to handle tool calls
  while (searchCount < maxSearches) {
    console.log(`[claude_gruenerator_ask] Conversation round ${searchCount + 1}`);
    
    // Make AI request with tools
    const aiResult = await aiWorkerPool.processRequest({
      type: 'gruenerator_ask',
      messages: messages,
      systemPrompt: systemPrompt,
      options: {
        max_tokens: 2000,
        useBedrock: true,
        anthropic_version: "bedrock-2023-05-31",
        tools: [SEARCH_DOCUMENTS_TOOL]
      }
    });
    
    console.log('[claude_gruenerator_ask] AI Result:', {
      success: aiResult.success,
      hasContent: !!aiResult.content,
      stopReason: aiResult.stop_reason,
      hasToolCalls: !!(aiResult.tool_calls && aiResult.tool_calls.length > 0)
    });
    
    if (!aiResult.success) {
      throw new Error(aiResult.error || 'AI request failed');
    }
    
    // Add assistant's response to conversation
    if (aiResult.raw_content_blocks) {
      messages.push({
        role: "assistant",
        content: aiResult.raw_content_blocks
      });
    }
    
    // Handle tool calls if present
    if (aiResult.stop_reason === 'tool_use' && aiResult.tool_calls && aiResult.tool_calls.length > 0) {
      console.log(`[claude_gruenerator_ask] Processing ${aiResult.tool_calls.length} tool calls`);
      
      const toolResults = [];
      
      for (const toolCall of aiResult.tool_calls) {
        if (toolCall.name === 'search_documents') {
          console.log(`[claude_gruenerator_ask] Executing search: "${toolCall.input.query}"`);
          
          const searchResult = await executeSearchTool(toolCall.input, userId, groupId);
          allSearchResults.push(...searchResult.results);
          
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolCall.id,
            content: JSON.stringify({
              success: searchResult.success,
              results: searchResult.results,
              query: toolCall.input.query,
              searchType: searchResult.searchType,
              message: searchResult.message
            })
          });
          
          searchCount++;
        }
      }
      
      // Add tool results to conversation
      if (toolResults.length > 0) {
        messages.push({
          role: "user",
          content: toolResults
        });
      }
      
      // Continue the conversation
      continue;
    }
    
    // No more tool calls - we have the final answer
    if (aiResult.content) {
      console.log('[claude_gruenerator_ask] Got final answer, processing response');
      return await processFinalResponse(aiResult.content, allSearchResults, question);
    }
    
    // Safety break
    break;
  }
  
  // Fallback if conversation didn't complete normally
  throw new Error('Conversation did not complete successfully');
}

/**
 * Assess query complexity to determine optimal search strategy
 */
function assessQueryComplexity(query) {
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const wordCount = words.length;
  
  // Detect complex concepts and relationships
  const complexIndicators = [
    'wie', 'warum', 'wann', 'wo', 'zusammenhang', 'beziehung', 'vergleich', 
    'unterschied', 'entwicklung', 'auswirkung', 'folgen', 'ursachen'
  ];
  
  const concepts = words.filter(word => 
    complexIndicators.some(indicator => word.includes(indicator)) ||
    word.length > 8 // Long words often indicate complex concepts
  );
  
  const isComplex = wordCount > 5 || 
                   concepts.length > 2 || 
                   query.includes('?') || 
                   complexIndicators.some(indicator => query.includes(indicator));
  
  const needsDiversity = wordCount > 8 || concepts.length > 3;
  
  return {
    isComplex,
    wordCount,
    concepts,
    needsDiversity
  };
}

/**
 * Execute search_documents tool call
 */
async function executeSearchTool(toolInput, userId, groupId) {
  try {
    const { query, search_mode = 'hybrid' } = toolInput;
    
    console.log(`[claude_gruenerator_ask] Executing search: "${query}" (mode: ${search_mode})`);
    
    // Intelligent search routing: Use MultiStageRetrieval for complex queries
    let searchResults;
    const queryComplexity = assessQueryComplexity(query);
    
    if (queryComplexity.isComplex && search_mode === 'vector') {
      console.log(`[claude_gruenerator_ask] Using enhanced vector search for complex query (${queryComplexity.wordCount} words, ${queryComplexity.concepts.length} concepts)`);
      
      try {
        searchResults = await vectorSearchService.search({
          query,
          user_id: userId,
          limit: 5,
          group_id: groupId || null,
          mode: 'vector'
        });
        
        // Vector search results are already in the expected format
      } catch (multiStageError) {
        console.warn(`[claude_gruenerator_ask] Enhanced vector search failed, falling back to standard search:`, multiStageError.message);
        searchResults = await vectorSearchService.search({
          query: query,
          user_id: userId,
          group_id: groupId || null,
          limit: 5,
          mode: search_mode
        });
      }
    } else {
      // Use standard search for simple queries or other modes
      searchResults = await vectorSearchService.search({
        query: query,
        user_id: userId,
        group_id: groupId || null,
        limit: 5,
        mode: search_mode
      });
    }
    
    // Format results for Claude
    const formattedResults = (searchResults.results || []).map((result, index) => {
      const title = result.title || result.document_title;
      const content = result.relevant_content || result.chunk_text;
      
      return {
        document_id: result.document_id,
        title: title,
        content: content.substring(0, 800), // Limit content length for tool response
        similarity_score: result.similarity_score,
        filename: result.filename,
        chunk_index: result.chunk_index || 0,
        relevance_info: result.relevance_info
      };
    });
    
    return {
      success: true,
      results: formattedResults,
      searchType: searchResults.searchType,
      message: `Found ${formattedResults.length} relevant documents`
    };
    
  } catch (error) {
    console.error('[claude_gruenerator_ask] Search tool error:', error);
    return {
      success: false,
      results: [],
      error: error.message,
      message: 'Search failed'
    };
  }
}

/**
 * Process the final response from Claude and extract citations
 */
async function processFinalResponse(responseContent, allSearchResults, originalQuestion) {
  console.log('[claude_gruenerator_ask] Processing final response, length:', responseContent.length);
  
  // Create document context from all search results for citation extraction
  const documentContext = [];
  const seenDocuments = new Set();
  
  allSearchResults.forEach((result, index) => {
    const docId = result.document_id;
    if (!seenDocuments.has(docId)) {
      seenDocuments.add(docId);
      documentContext.push({
        index: documentContext.length + 1,
        title: result.title,
        content: result.content,
        metadata: {
          document_id: result.document_id,
          similarity_score: result.similarity_score,
          chunk_index: result.chunk_index || 0,
          filename: result.filename
        }
      });
    }
  });
  
  // Use shared citation processing utility
  const citationResult = processAIResponseWithCitations(responseContent, documentContext, 'claude_gruenerator_ask');
  const { answer: processedAnswer, citations, sources } = citationResult;
  
  return {
    success: true,
    answer: processedAnswer, // Use processed answer with placeholders
    sources: sources,
    citations: citations,
    searchQuery: originalQuestion,
    searchCount: allSearchResults.length,
    uniqueDocuments: documentContext.length,
    metadata: {
      provider: 'claude_tools',
      timestamp: new Date().toISOString(),
      toolUseEnabled: true
    }
  };
}

export default router;