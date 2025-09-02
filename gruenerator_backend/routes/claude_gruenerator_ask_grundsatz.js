import express from 'express';
import authMiddlewareModule from '../middleware/authMiddleware.js';
import { grundsatzSearchService } from '../services/GrundsatzSearchService.js';
import passport from '../config/passportSetup.mjs';
import { 
  MARKDOWN_FORMATTING_INSTRUCTIONS, 
  extractCitationsFromText, 
  processAIResponseWithCitations 
} from '../utils/promptUtils.js';

const { requireAuth: ensureAuthenticated } = authMiddlewareModule;
const router = express.Router();

// Tool definition for grundsatz document search
const SEARCH_GRUNDSATZ_DOCUMENTS_TOOL = {
  name: 'search_grundsatz_documents',
  description: 'REQUIRED: Search through the official Bündnis 90/Die Grünen political documents to find exact quotes and positions. This tool accesses Grundsatzprogramm 2020, EU-Wahlprogramm 2024, and Regierungsprogramm 2025. You MUST use this tool before answering any political questions to get accurate, citable information.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search terms to find relevant political content. Use specific keywords like "Wald", "Klima", "Energie", "Bildung", etc. Be specific and focused.'
      },
      search_mode: {
        type: 'string',
        enum: ['vector', 'hybrid', 'keyword'],
        description: 'Search mode: vector (semantic), hybrid (semantic + keyword), or keyword (text matching). Default is hybrid for best results.'
      }
    },
    required: ['query']
  }
};


// Add Passport session middleware
router.use(passport.session());

router.post('/', ensureAuthenticated, async (req, res) => {
  try {
    const { question } = req.body;

    if (!question || question.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Question is required'
      });
    }

    console.log(`[claude_gruenerator_ask_grundsatz] Processing Grundsatz question for user ${req.user.id}:`, question.substring(0, 100));

    // Tool-use approach: Let Claude search grundsatz documents dynamically
    const result = await handleGrundsatzQuestionWithTools(question, req.user.id, req.app.locals.aiWorkerPool);
    
    res.json(result);

  } catch (error) {
    console.error('[claude_gruenerator_ask_grundsatz] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to process Grundsatz question'
    });
  }
});

/**
 * Handle grundsatz question using tool-use approach where Claude can search grundsatz documents multiple times
 */
async function handleGrundsatzQuestionWithTools(question, userId, aiWorkerPool) {
  console.log('[claude_gruenerator_ask_grundsatz] Starting tool-use conversation for Grundsatz search');
  
  // System prompt for tool-guided grundsatz document analysis
  const systemPrompt = `Du bist ein politischer Analyst mit direktem Zugang zu den offiziellen Grundsatzprogrammen von Bündnis 90/Die Grünen. 

ERSTE AKTION: Verwende SOFORT das search_grundsatz_documents Tool. Beginne NICHT mit einer Textantwort.

Verfügbare Dokumente:
- Grundsatzprogramm 2020 (136 Seiten)
- EU-Wahlprogramm 2024 (114 Seiten) 
- Regierungsprogramm 2025 (160 Seiten)

STRENGER ABLAUF:
1. ERSTE AKTION: Verwende search_grundsatz_documents mit spezifischen Suchbegriffen
2. Führe weitere Suchen durch, wenn nötig
3. Erstelle NUR Zitate aus den tatsächlichen Suchergebnissen
4. Schreibe dann deine Antwort basierend auf den gefundenen Dokumenten

VERBOT: Verwende NIEMALS Informationen oder Zitate aus deinem Training. Nur Suchergebnisse sind erlaubt.

${MARKDOWN_FORMATTING_INSTRUCTIONS}`;

  // Initial conversation state
  let messages = [{
    role: "user",
    content: question
  }];
  
  let allSearchResults = [];
  let searchCount = 0;
  const maxSearches = 5; // Prevent infinite loops
  
  console.log('[claude_gruenerator_ask_grundsatz] Starting conversation with grundsatz tools');
  
  // Conversation loop to handle tool calls
  while (searchCount < maxSearches) {
    console.log(`[claude_gruenerator_ask_grundsatz] Conversation round ${searchCount + 1}`);
    
    // Make AI request with tools - force tool usage on first call
    const aiResult = await aiWorkerPool.processRequest({
      type: 'gruenerator_ask_grundsatz',
      messages: messages,
      systemPrompt: systemPrompt,
      options: {
        max_tokens: 2000,
        useBedrock: true,
        anthropic_version: "bedrock-2023-05-31",
        tools: [SEARCH_GRUNDSATZ_DOCUMENTS_TOOL],
        // Force tool usage on first call to ensure Claude searches documents
        tool_choice: searchCount === 0 ? { "type": "tool", "name": "search_grundsatz_documents" } : undefined
      }
    });
    
    console.log('[claude_gruenerator_ask_grundsatz] AI Result:', {
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
      console.log(`[claude_gruenerator_ask_grundsatz] Processing ${aiResult.tool_calls.length} grundsatz tool calls`);
      
      const toolResults = [];
      
      for (const toolCall of aiResult.tool_calls) {
        if (toolCall.name === 'search_grundsatz_documents') {
          console.log(`[claude_gruenerator_ask_grundsatz] Executing grundsatz search: "${toolCall.input.query}"`);
          
          const searchResult = await executeGrundsatzSearchTool(toolCall.input, userId);
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
      console.log('[claude_gruenerator_ask_grundsatz] Got final grundsatz answer, processing response');
      return await processFinalResponse(aiResult.content, allSearchResults, question);
    }
    
    // Safety break
    break;
  }
  
  // Fallback if conversation didn't complete normally
  throw new Error('Grundsatz conversation did not complete successfully');
}

/**
 * Execute search_grundsatz_documents tool call
 */
async function executeGrundsatzSearchTool(toolInput, userId) {
  try {
    const { query, search_mode = 'hybrid' } = toolInput;
    
    console.log(`[claude_gruenerator_ask_grundsatz] Executing grundsatz search: "${query}" (mode: ${search_mode})`);
    
    // Use grundsatz-specific search
    const searchResults = await grundsatzSearchService.searchGrundsatz({
      query: query,
      user_id: userId,
      limit: 5,
      mode: search_mode
    });
    
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
      message: `Found ${formattedResults.length} relevant documents from Grundsatzprogramme`
    };
    
  } catch (error) {
    console.error('[claude_gruenerator_ask_grundsatz] Grundsatz search tool error:', error);
    return {
      success: false,
      results: [],
      error: error.message,
      message: 'Grundsatz search failed'
    };
  }
}

/**
 * Process the final response from Claude and extract citations
 */
async function processFinalResponse(responseContent, allSearchResults, originalQuestion) {
  console.log('[claude_gruenerator_ask_grundsatz] Processing final grundsatz response, length:', responseContent.length);
  
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
  
  let citations = [];
  let answer = responseContent;
  
  // Strategy 1: Look for structured citation section with flexible patterns
  const citationSectionPatterns = [
    /Hier sind die relevanten Zitate aus den Grundsatzprogrammen.*?:\s*\n\n([\s\S]*?)\n\nAntwort:/i,
    /Relevante Zitate aus den Grundsatzprogrammen.*?:\s*\n\n([\s\S]*?)\n\nAntwort:/i,
    /Zitate aus den Grundsatzprogrammen.*?:\s*\n\n([\s\S]*?)\n\nAntwort:/i,
    /Hier sind die relevanten Zitate.*?:\s*\n\n([\s\S]*?)\n\nAntwort:/i,
    /Relevante Zitate.*?:\s*\n\n([\s\S]*?)\n\nAntwort:/i,
    /Zitate.*?:\s*\n\n([\s\S]*?)\n\nAntwort:/i
  ];
  
  let citationSectionFound = false;
  for (const pattern of citationSectionPatterns) {
    const citationMatch = responseContent.match(pattern);
    if (citationMatch) {
      const citationText = citationMatch[1];
      answer = responseContent.substring(responseContent.indexOf('Antwort:') + 8).trim();
      
      console.log('[claude_gruenerator_ask_grundsatz] Found grundsatz citation section using pattern, extracting citations...');
      citations = extractCitationsFromText(citationText, documentContext, 'claude_gruenerator_ask_grundsatz');
      citationSectionFound = true;
      break;
    }
  }
  
  // Strategy 2: If no structured section found, look for citations throughout the text
  if (!citationSectionFound) {
    console.log('[claude_gruenerator_ask_grundsatz] No structured citation section found, searching entire response...');
    citations = extractCitationsFromText(responseContent, documentContext, 'claude_gruenerator_ask_grundsatz');
    
    // Try to extract clean answer if we found citations
    if (citations.length > 0) {
      const answerMatch = responseContent.match(/\nAntwort:\s*([\s\S]*)$/i);
      if (answerMatch) {
        answer = answerMatch[1].trim();
      } else {
        // If no "Antwort:" found, try to clean up the response by removing citation lines
        answer = responseContent.replace(/\[\d+\]\s*"[^"]*"(?:\s*\([^)]*\))?/g, '').trim();
      }
    }
  }
  
  console.log('[claude_gruenerator_ask_grundsatz] Grundsatz citation extraction complete. Found', citations.length, 'citations');
  
  // For Grundsatz, keep original citation format [1], [2], etc. instead of using markers
  let processedAnswer = answer;
  
  // Prepare enhanced sources information with citations
  const sources = documentContext.map((doc, idx) => {
    const citationsForDoc = citations.filter(c => c.document_id === doc.metadata.document_id);
    return {
      document_id: doc.metadata.document_id,
      document_title: doc.title,
      chunk_text: doc.content.substring(0, 200) + '...',
      similarity_score: doc.metadata.similarity_score,
      citations: citationsForDoc
    };
  });
  
  return {
    success: true,
    answer: processedAnswer, // Keep original [1], [2] citation format for Grundsatz
    sources: sources,
    citations: citations,
    searchQuery: originalQuestion,
    searchCount: allSearchResults.length,
    uniqueDocuments: documentContext.length,
    metadata: {
      provider: 'claude_grundsatz_tools',
      timestamp: new Date().toISOString(),
      toolUseEnabled: true,
      documentSource: 'grundsatz'
    }
  };
}

export default router;