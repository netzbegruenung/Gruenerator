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
  queryOptimizerNode,
  searchExecutorNode,
  deepResearchNode,
  searchRespondNode,
  suggestFollowUpsNode,
  setResearchProgressCallback,
} from '../../agents/langgraph/SearchGraph/index.js';
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

import type { SearchGraphState } from '../../agents/langgraph/SearchGraph/types.js';
import type { AuthenticatedRequest } from '../../middleware/types.js';
import type { Response } from 'express';

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
    const { query, messages, threadId, searchMode = 'web', locale } = req.body;

    if (!query && (!messages || messages.length === 0)) {
      sse.sendRaw('error', { error: 'Query or messages required' });
      sse.end();
      return;
    }

    const userId = req.user?.id || req.user?.keycloak_id || 'anonymous';

    // Normalize messages from frontend format { role, parts: [{ type, text }] }
    // to AI SDK format { role, content: string }
    const normalizedMessages = (messages || [{ role: 'user', content: query }]).map((m: any) => {
      if (m.content) return { role: m.role, content: m.content };
      if (m.parts) {
        const text = m.parts
          .filter((p: any) => p.type === 'text')
          .map((p: any) => p.text)
          .join(' ');
        return { role: m.role, content: text || '' };
      }
      return { role: m.role, content: '' };
    });

    // Initialize state
    let state = await initializeSearchState({
      query: query || '',
      messages: normalizedMessages,
      threadId,
      searchMode: searchMode === 'deep' ? 'deep' : 'web',
      aiWorkerPool: req.app.locals.aiWorkerPool,
      userLocale: locale || 'de-DE',
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
        'search',
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

    // ── Step 1: Query Optimization ──
    sse.sendRaw('search_start', { message: 'Optimiere Suchanfrage...' });
    state = mergeState(state, await queryOptimizerNode(state));

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

    // ── Step 3: Rerank ──
    if (state.searchResults.length > 3) {
      state = mergeState(state, (await rerankNode(state as any)) as Partial<SearchGraphState>);
    }

    if (abortController.signal.aborted) {
      sse.end();
      return;
    }

    // ── Step 4: Quality Gate (with loop) ──
    state = mergeState(state, (await qualityGateNode(state as any)) as Partial<SearchGraphState>);

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
        state = mergeState(state, (await rerankNode(state as any)) as Partial<SearchGraphState>);
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

    const { model: aiModel } = resolveModel(state.agentConfig);
    const messagesForAI = buildMessagesForAI(state.responseText, state.messages);

    const fullText = await streamAndAccumulate({
      model: aiModel,
      messages: messagesForAI,
      maxTokens: state.searchMode === 'deep' ? 4000 : 2000,
      temperature: 0.3,
      sse,
      logPrefix: '[SearchGraph]',
    });

    if (abortController.signal.aborted) {
      sse.end();
      return;
    }

    // ── Step 7: Follow-Up Suggestions (parallel with persistence) ──
    const [suggestResult] = await Promise.all([
      suggestFollowUpsNode(state).catch(() => ({ followUpSuggestions: [] })),
      // Persist assistant response
      createMessage(activeThreadId, 'assistant', fullText || '', {
        searchMode: state.searchMode,
        searchResults: state.searchResults,
        citations: state.citations,
        searchedCollections: state.searchedCollections,
      }),
    ]);

    state = mergeState(state, suggestResult as Partial<SearchGraphState>);

    // ── Send Suggestions ──
    if (state.followUpSuggestions.length > 0) {
      sse.sendRaw('suggestions', {
        suggestions: state.followUpSuggestions,
      });
    }

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
