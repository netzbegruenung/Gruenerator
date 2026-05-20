/**
 * SearchGraph Streaming Controller
 *
 * SSE endpoint for the Perplexity-style search pipeline.
 * Runs SearchGraph nodes individually with progress events between steps,
 * then streams the AI-generated answer via text_delta events.
 *
 * Event order (optimized for sources-first rendering):
 * 1. search_start
 * 2. sources_preview  ← sources before answer (key Perplexity differentiator)
 * 3. response_start
 * 4. text_delta (multiple)
 * 5. suggestions
 * 6. done
 *
 * Deep mode adds research_step events for granular progress.
 */

import { Router } from 'express';

import { qualityGateNode } from '../../agents/langgraph/ChatGraph/nodes/qualityGateNode.js';
import { rerankNode } from '../../agents/langgraph/ChatGraph/nodes/rerankNode.js';
import {
  initializeSearchState,
  searchExecutorNode,
  deepResearchNode,
  searchRespondNode,
  suggestFollowUpsNode,
  setResearchProgressCallback,
} from '../../agents/langgraph/SearchGraph/index.js';
import { intelligentCrawlNode } from '../../agents/langgraph/SearchGraph/nodes/intelligentCrawlNode.js';
import { queryPlannerNode } from '../../agents/langgraph/SearchGraph/nodes/queryPlannerNode.js';
import { createLogger } from '../../utils/logger.js';
import {
  resolveModel,
  buildMessagesForAI,
  streamAndAccumulate,
} from '../chat/services/responseStreamingService.js';
import { createSSEStream } from '../chat/services/sseHelpers.js';
import {
  createThread,
  createMessage,
  threadExists,
  touchThread,
} from '../chat/services/threadPersistenceService.js';

import type { ChatGraphState, UserLocale } from '../../agents/langgraph/ChatGraph/types.js';
import type { SearchGraphState } from '../../agents/langgraph/SearchGraph/types.js';
import type { AuthenticatedRequest } from '../../middleware/types.js';
import type { AIWorkerPool } from '../../workers/types.js';
import type { ModelMessage } from 'ai';
import type { Response } from 'express';

interface MessagePart {
  type: string;
  text: string;
}

interface IncomingMessage {
  role: string;
  content?: string;
  parts?: MessagePart[];
}

interface SearchStreamBody {
  query?: string;
  messages?: IncomingMessage[];
  threadId?: string;
  searchMode?: string;
  locale?: string;
  agentId?: string | null;
}

const log = createLogger('SearchGraphController');
const router = Router();

/**
 * Merge partial node output into current state.
 */
function mergeState(state: SearchGraphState, partial: Partial<SearchGraphState>): SearchGraphState {
  return { ...state, ...partial };
}

/**
 * Build a sources preview payload from search results.
 * Truncates content to 150 chars for the SSE preview event.
 */
function buildSourcesPreview(state: SearchGraphState) {
  return {
    results: state.searchResults.map((r) => ({
      source: r.source,
      title: r.title,
      url: r.url,
      content: r.content?.substring(0, 150) || '',
      relevance: r.relevance,
    })),
    resultCount: state.searchResults.length,
    searchedCollections: state.searchedCollections,
  };
}

/**
 * POST /api/search-graph/stream
 *
 * Streams search results and AI-generated answer.
 */
router.post('/stream', async (req: AuthenticatedRequest, res: Response) => {
  const sse = createSSEStream(res);
  const abortController = new AbortController();

  req.on('close', () => abortController.abort());

  try {
    const {
      query,
      messages,
      threadId,
      searchMode = 'web',
      locale,
      agentId,
    } = req.body as SearchStreamBody;
    // Stamp the thread with the Suche agent so thread listings + ?agent= URL sync
    // show consistent metadata. Falls back to the canonical Suche agent id.
    const persistedAgentId = agentId || 'gruenerator-suche';

    if (!query && (!messages || messages.length === 0)) {
      sse.sendRaw('error', { error: 'Query or messages required' });
      sse.end();
      return;
    }

    const userId = req.user?.id || req.user?.keycloak_id || 'anonymous';

    // Normalize messages from frontend format { role, parts: [{ type, text }] }
    // to AI SDK format { role, content: string }
    const inputMessages: IncomingMessage[] = messages || [{ role: 'user', content: query ?? '' }];
    const normalizedMessages = inputMessages.map((m) => {
      if (m.content) return { role: m.role, content: m.content };
      if (m.parts) {
        const text = m.parts
          .filter((p) => p.type === 'text')
          .map((p) => p.text)
          .join(' ');
        return { role: m.role, content: text || '' };
      }
      return { role: m.role, content: '' };
    });

    // Initialize state
    let state = await initializeSearchState({
      query: query || '',
      messages: normalizedMessages as ModelMessage[],
      threadId,
      searchMode: searchMode === 'deep' ? 'deep' : 'web',
      aiWorkerPool: req.app.locals.aiWorkerPool as AIWorkerPool,
      userLocale: (locale || 'de-DE') as UserLocale,
    });

    // Thread persistence: create or reuse
    let activeThreadId = threadId;
    if (activeThreadId) {
      const exists = await threadExists(activeThreadId);
      if (exists) {
        await touchThread(activeThreadId);
      } else {
        activeThreadId = undefined;
      }
    }
    if (!activeThreadId) {
      const thread = await createThread(
        userId,
        persistedAgentId,
        query?.substring(0, 100) || 'Suche',
        'search'
      );
      activeThreadId = thread.id;
      state = mergeState(state, { threadId: activeThreadId });
      sse.sendRaw('thread_created', { threadId: activeThreadId });
    }

    // Save user message
    await createMessage(
      activeThreadId,
      'user',
      query || state.searchQuery || '',
      undefined,
      userId
    );

    if (abortController.signal.aborted) {
      sse.end();
      return;
    }

    // ── Step 1: Query Planning ──
    sse.sendRaw('search_start', { message: 'Analysiere Suchanfrage...' });
    state = mergeState(state, await queryPlannerNode(state));

    if (abortController.signal.aborted) {
      sse.end();
      return;
    }

    // ── Step 2: Search Execution ──
    if (state.searchMode === 'deep') {
      // Set up progress callback for granular deep research events
      setResearchProgressCallback((step, message) => {
        sse.sendRaw('research_step', { step, message });
      });

      sse.sendRaw('search_start', { message: 'Starte umfassende Recherche...' });
      state = mergeState(state, await deepResearchNode(state));
      setResearchProgressCallback(null);
    } else {
      sse.sendRaw('search_start', { message: 'Durchsuche Dokumente und Web...' });
      state = mergeState(state, await searchExecutorNode(state));
    }

    if (abortController.signal.aborted) {
      sse.end();
      return;
    }

    // ── Sources Preview (BEFORE answer — Perplexity-style) ──
    sse.sendRaw('sources_preview', buildSourcesPreview(state));

    // ── Step 2b: Intelligent Crawl (web mode only — enriches top results with full content) ──
    if (state.searchMode !== 'deep' && state.searchResults.length > 0) {
      sse.sendRaw('research_step', { step: 'crawling', message: 'Lese relevante Quellen...' });
      state = mergeState(state, await intelligentCrawlNode(state));
    }

    if (abortController.signal.aborted) {
      sse.end();
      return;
    }

    // ── Step 3: Rerank ──
    if (state.searchResults.length > 3) {
      state = mergeState(
        state,
        (await rerankNode(state as unknown as ChatGraphState)) as Partial<SearchGraphState>
      );
    }

    if (abortController.signal.aborted) {
      sse.end();
      return;
    }

    // ── Step 4: Quality Gate (with loop) ──
    state = mergeState(
      state,
      (await qualityGateNode(state as unknown as ChatGraphState)) as Partial<SearchGraphState>
    );

    // Quality gate loop
    if (state.qualityScore > 0 && state.qualityScore < 3 && state.searchCount < state.maxSearches) {
      log.info(`[SearchGraph] Quality gate loop: score=${state.qualityScore}, retrying search`);
      sse.sendRaw('search_start', { message: 'Verfeinere Suche...' });

      if (state.searchMode === 'deep') {
        state = mergeState(state, await deepResearchNode(state));
      } else {
        state = mergeState(state, await searchExecutorNode(state));
      }

      if (state.searchResults.length > 3) {
        state = mergeState(
          state,
          (await rerankNode(state as unknown as ChatGraphState)) as Partial<SearchGraphState>
        );
      }

      // Updated sources preview after refinement
      sse.sendRaw('sources_preview', buildSourcesPreview(state));
    }

    if (abortController.signal.aborted) {
      sse.end();
      return;
    }

    // ── Step 5: Build Response Context ──
    state = mergeState(state, await searchRespondNode(state));

    if (abortController.signal.aborted) {
      sse.end();
      return;
    }

    // ── Step 6: Stream AI Response ──
    sse.sendRaw('response_start', { message: 'Erstelle Antwort...' });

    // SearchGraph uses the agent's default (Mistral) — no user model override,
    // so the overflow alternator never fires and there's no slot to release.
    const searchRequestId = `search_${Date.now()}`;
    const { model: aiModel } = await resolveModel(state.agentConfig, undefined, searchRequestId);
    // Cap conversation history to last 4 messages to stay under Mistral's quality threshold (~40k tokens)
    const recentMessages = state.messages.slice(-4);
    const messagesForAI = buildMessagesForAI(state.responseText, recentMessages);

    const fullText = await streamAndAccumulate({
      model: aiModel,
      messages: messagesForAI,
      maxTokens: state.searchMode === 'deep' ? 12000 : 6000,
      temperature: 0.3,
      sse,
      logPrefix: '[SearchGraph]',
    });

    if (abortController.signal.aborted) {
      sse.end();
      return;
    }

    // ── Step 7: Follow-Up Suggestions (parallel with persistence) ──
    // Persist a toolCalls entry so the Deep Research / web_search card rehydrates
    // on reload with the same shape the live SSE stream produced. Field names
    // mirror ResearchToolResult in ChatGraph/types.ts so the same ResearchArtifactCard
    // renders both flows.
    const isDeep = state.searchMode === 'deep';
    const confidence: 'high' | 'medium' | 'low' =
      state.qualityScore >= 0.7 ? 'high' : state.qualityScore >= 0.4 ? 'medium' : 'low';
    const toolCalls = [
      {
        toolCallId: `tc_${Date.now()}`,
        toolName: isDeep ? 'research' : 'web_search',
        args: { query: state.searchQuery ?? '' },
        result: isDeep
          ? {
              answer: fullText,
              citations: state.citations,
              confidence,
              searchSteps: [],
            }
          : { results: state.searchResults },
      },
    ];

    const [suggestResult] = await Promise.all([
      suggestFollowUpsNode(state).catch(() => ({ followUpSuggestions: [] })),
      // Persist assistant response
      createMessage(activeThreadId, 'assistant', fullText || '', {
        intent: isDeep ? 'research' : 'web',
        searchMode: state.searchMode,
        searchResults: state.searchResults,
        citations: state.citations,
        searchedCollections: state.searchedCollections,
        toolCalls,
      }),
    ]);

    state = mergeState(state, suggestResult as Partial<SearchGraphState>);

    // ── Send Suggestions ──
    if (state.followUpSuggestions.length > 0) {
      sse.sendRaw('suggestions', {
        suggestions: state.followUpSuggestions,
      });
    }

    // ── Completion (atomic text+citations swap, prevents citation flinch) ──
    // Mirrors the NotebookModelAdapter protocol: the frontend `completion`
    // handler swaps accumulatedText with this canonical text (rewriting
    // [cite:N] → [N]) and replaces citations in the same render pass, so chips
    // appear simultaneously with the final markers — no plain "[1]" frame.
    // Citations are remapped to the notebook citation shape that
    // GrueneratorModelAdapter's `completion` case already understands.
    sse.send('completion', {
      type: 'completion',
      text: fullText ?? '',
      citations: state.citations.map((c) => ({
        index: String(c.id),
        cited_text: c.snippet,
        document_title: c.title,
        document_id: c.documentId,
        source_url: c.url,
        similarity_score: c.similarityScore,
        collection_name: c.collectionName ?? c.source,
      })),
    });

    // ── Done ──
    const totalTimeMs = Date.now() - state.startTime;
    sse.send('done', {
      threadId: activeThreadId,
      citations: state.citations,
      metadata: {
        intent: 'search',
        searchCount: state.searchCount,
        totalTimeMs,
        searchTimeMs: state.searchTimeMs,
      },
    });
    sse.end();

    log.info(
      `[SearchGraph] Stream complete: mode=${state.searchMode}, results=${state.searchResults.length}, suggestions=${state.followUpSuggestions.length}, time=${totalTimeMs}ms`
    );
  } catch (error: unknown) {
    log.error('[SearchGraph] Stream error:', error);
    if (!sse.isEnded()) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      sse.sendRaw('error', { error: message });
      sse.end();
    }
  }
});

export default router;
