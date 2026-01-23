import express, { Router, Request, Response } from 'express';
import authMiddlewareModule from '../../middleware/authMiddleware.js';
import { DocumentSearchService } from '../../services/document-services/DocumentSearchService/index.js';
import passport from '../../config/passportSetup.js';
import { createLogger } from '../../utils/logger.js';
import {
  MARKDOWN_FORMATTING_INSTRUCTIONS,
  SEARCH_DOCUMENTS_TOOL,
  processAIResponseWithCitations
} from '../../utils/prompt/index.js';
import type {
  ToolCall,
  ToolResult,
  SearchResult,
  DocumentContext,
  MessageContent
} from '../../types/routes.js';
import type { Citation, SourceInfo } from '../../utils/prompt/types.js';
import type { AIWorkerPool } from '../../types/workers.js';
import type { UserProfile } from '../../services/user/types.js';

const log = createLogger('claude_gruenerator_ask');
const documentSearchService = new DocumentSearchService();
const { requireAuth: ensureAuthenticated } = authMiddlewareModule;
const router: Router = express.Router();

// Helper to get user profile from request
const getUser = (req: Request): UserProfile | undefined => (req as any).user as UserProfile | undefined;

interface GrueneratorAskRequestBody {
  question: string;
  group_id?: string;
}

interface QueryComplexity {
  isComplex: boolean;
  wordCount: number;
  concepts: string[];
  needsDiversity: boolean;
}

interface SearchToolInput {
  query: string;
  search_mode?: string;
}

interface SearchToolResult {
  success: boolean;
  results: SearchResult[];
  searchType?: string;
  error?: string;
  message: string;
}

interface FinalResponse {
  success: boolean;
  answer: string;
  sources: SourceInfo[];
  citations: Citation[];
  searchQuery: string;
  searchCount: number;
  uniqueDocuments: number;
  metadata: {
    provider: string;
    timestamp: string;
    toolUseEnabled: boolean;
  };
}

router.use(passport.session());

router.post('/', ensureAuthenticated, async (req: Request, res: Response): Promise<void> => {
  try {
    const { question, group_id } = req.body as GrueneratorAskRequestBody;
    const user = getUser(req);

    if (!question || question.trim().length === 0) {
      res.status(400).json({
        success: false,
        message: 'Question is required'
      });
      return;
    }

    log.debug(`[claude_gruenerator_ask] Processing question for user ${user?.id}:`, question.substring(0, 100));

    const result = await handleQuestionWithTools(question, user?.id || 'anonymous', group_id, req.app.locals.aiWorkerPool);

    res.json(result);

  } catch (error) {
    log.error('[claude_gruenerator_ask] Error:', error);
    res.status(500).json({
      success: false,
      message: (error as Error).message || 'Failed to process question'
    });
  }
});

async function handleQuestionWithTools(
  question: string,
  userId: string,
  groupId: string | undefined,
  aiWorkerPool: AIWorkerPool
): Promise<FinalResponse> {
  log.debug('[claude_gruenerator_ask] Starting tool-use conversation');

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

  const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: any }> = [{
    role: 'user',
    content: question
  }];

  let allSearchResults: SearchResult[] = [];
  let searchCount = 0;
  const maxSearches = 5;

  log.debug('[claude_gruenerator_ask] Starting conversation with tools');

  while (searchCount < maxSearches) {
    log.debug(`[claude_gruenerator_ask] Conversation round ${searchCount + 1}`);

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

    log.debug('[claude_gruenerator_ask] AI Result:', {
      success: aiResult.success,
      hasContent: !!aiResult.content,
      stopReason: aiResult.stop_reason,
      hasToolCalls: !!(aiResult.tool_calls && aiResult.tool_calls.length > 0)
    });

    if (!aiResult.success) {
      throw new Error(aiResult.error || 'AI request failed');
    }

    if (aiResult.raw_content_blocks) {
      messages.push({
        role: "assistant",
        content: aiResult.raw_content_blocks
      });
    }

    if (aiResult.stop_reason === 'tool_use' && aiResult.tool_calls && aiResult.tool_calls.length > 0) {
      log.debug(`[claude_gruenerator_ask] Processing ${aiResult.tool_calls.length} tool calls`);

      const toolResults: ToolResult[] = [];

      for (const toolCall of aiResult.tool_calls) {
        if (toolCall.name === 'search_documents') {
          const toolInput = toolCall.input as unknown as SearchToolInput;
          log.debug(`[claude_gruenerator_ask] Executing search: "${toolInput.query}"`);

          const searchResult = await executeSearchTool(toolInput, userId, groupId);
          allSearchResults.push(...searchResult.results);

          toolResults.push({
            type: "tool_result",
            tool_use_id: toolCall.id,
            content: JSON.stringify({
              success: searchResult.success,
              results: searchResult.results,
              query: toolInput.query,
              searchType: searchResult.searchType,
              message: searchResult.message
            })
          });

          searchCount++;
        }
      }

      if (toolResults.length > 0) {
        messages.push({
          role: "user",
          content: toolResults
        });
      }

      continue;
    }

    if (aiResult.content) {
      log.debug('[claude_gruenerator_ask] Got final answer, processing response');
      return await processFinalResponse(aiResult.content, allSearchResults, question);
    }

    break;
  }

  throw new Error('Conversation did not complete successfully');
}

function assessQueryComplexity(query: string): QueryComplexity {
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const wordCount = words.length;

  const complexIndicators = [
    'wie', 'warum', 'wann', 'wo', 'zusammenhang', 'beziehung', 'vergleich',
    'unterschied', 'entwicklung', 'auswirkung', 'folgen', 'ursachen'
  ];

  const concepts = words.filter(word =>
    complexIndicators.some(indicator => word.includes(indicator)) ||
    word.length > 8
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

async function executeSearchTool(
  toolInput: SearchToolInput,
  userId: string,
  groupId: string | undefined
): Promise<SearchToolResult> {
  try {
    const { query, search_mode: rawSearchMode = 'hybrid' } = toolInput;
    const search_mode = rawSearchMode as 'hybrid' | 'text' | 'vector';

    log.debug(`[claude_gruenerator_ask] Executing search: "${query}" (mode: ${search_mode})`);

    let searchResults;
    const queryComplexity = assessQueryComplexity(query);

    if (queryComplexity.isComplex && search_mode === 'vector') {
      log.debug(`[claude_gruenerator_ask] Using enhanced vector search for complex query (${queryComplexity.wordCount} words, ${queryComplexity.concepts.length} concepts)`);

      try {
        searchResults = await documentSearchService.search({
          query,
          userId: userId,
          limit: 5,
          group_id: groupId || null,
          mode: 'vector'
        });

      } catch (multiStageError) {
        log.warn(`[claude_gruenerator_ask] Enhanced vector search failed, falling back to standard search:`, (multiStageError as Error).message);
        searchResults = await documentSearchService.search({
          query: query,
          userId: userId,
          group_id: groupId || null,
          limit: 5,
          mode: search_mode
        });
      }
    } else {
      searchResults = await documentSearchService.search({
        query: query,
        userId: userId,
        group_id: groupId || null,
        limit: 5,
        mode: search_mode
      });
    }

    const formattedResults: SearchResult[] = (searchResults.results || []).map((result) => {
      const title = result.title || '';
      const content = result.relevant_content || '';

      return {
        document_id: result.document_id,
        title: title,
        content: content.substring(0, 800),
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
    log.error('[claude_gruenerator_ask] Search tool error:', error);
    return {
      success: false,
      results: [],
      error: (error as Error).message,
      message: 'Search failed'
    };
  }
}

async function processFinalResponse(
  responseContent: string,
  allSearchResults: SearchResult[],
  originalQuestion: string
): Promise<FinalResponse> {
  log.debug('[claude_gruenerator_ask] Processing final response, length:', responseContent.length);

  const documentContext: DocumentContext[] = [];
  const seenDocuments = new Set<string>();

  allSearchResults.forEach((result) => {
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

  const citationResult = processAIResponseWithCitations(responseContent, documentContext, 'claude_gruenerator_ask');
  const { answer: processedAnswer, citations, sources } = citationResult;

  return {
    success: true,
    answer: processedAnswer,
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
