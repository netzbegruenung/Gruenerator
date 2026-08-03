/**
 * ts-rest contract router for /api/search-graph
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
 *
 * The request body is validated by the contract (schemas/searchGraph.ts), so
 * `searchMode` arrives already narrowed to 'web' | 'deep' and the handler never
 * casts req.body.
 */

import { searchGraphContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

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
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { createLogger } from '../../utils/logger.js';
import { ThreadId, UserId } from '../../utils/types/branded.js';
import {
  resolveModel,
  buildMessagesForAI,
  streamAndAccumulate,
} from '../chat/services/responseStreamingService.js';
import { createSSEStream } from '../chat/services/sseHelpers.js';
import { canAccessThread } from '../chat/services/threadAccessService.js';
import {
  createThread,
  createMessage,
  getUser,
  touchThread,
} from '../chat/services/threadPersistenceService.js';

import type { ChatGraphState, UserLocale } from '../../agents/langgraph/ChatGraph/types.js';
import type { SearchGraphState } from '../../agents/langgraph/SearchGraph/types.js';
import type { AIWorkerPool } from '../../workers/types.js';
import type { SearchGraphStreamBody } from '@gruenerator/contracts';
import type { ModelMessage } from 'ai';
import type { Application } from 'express';

const log = createLogger('SearchGraphController');
const s = initServer();

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

type WireMessage = NonNullable<SearchGraphStreamBody['messages']>[number];

/**
 * Normalize the two client wire formats — the chat UI's
 * `{ role, parts: [{ type, text }] }` and plain `{ role, content }` — into the
 * AI SDK's `{ role, content: string }`. The contract guarantees the envelope
 * (role + at least one of parts/content), but part internals pass through
 * `passthrough()`, so `text` is still read defensively.
 */
function partText(part: { type: string }): string {
  const text = (part as unknown as { text?: unknown }).text;
  return typeof text === 'string' ? text : '';
}

function normalizeWireMessages(messages: WireMessage[]) {
  return messages.map((m) => {
    if (typeof m.content === 'string') return { role: m.role, content: m.content };
    if (m.parts) {
      const text = m.parts
        .filter((p) => p.type === 'text')
        .map(partText)
        .join(' ');
      return { role: m.role, content: text };
    }
    return { role: m.role, content: '' };
  });
}

export const searchGraphContractRouter = s.router(searchGraphContract, {
  stream: async (args) => {
    const { req } = args;
    const sse = createSSEStream(args.res);
    const abortController = new AbortController();

    req.on('close', () => abortController.abort());

    try {
      const { query, messages, threadId, searchMode, agentId } = args.body;
      // Stamp the thread with the Suche agent so thread listings + ?agent= URL sync
      // show consistent metadata. Falls back to the canonical Suche agent id.
      const persistedAgentId = agentId || 'gruenerator-suche';

      const user = getUser(req);
      if (!user?.id) {
        sse.sendRaw('error', { error: 'Authentication required' });
        sse.end();
        return { status: 200 as const, body: undefined };
      }
      const userId = user.id;
      // Locale is derived server-side from the authenticated profile, never from
      // the request body — mirrors buildStreamContext for ChatGraph. Without it
      // AT users silently got the DE web-search region in deepResearchNode.
      const userLocale: UserLocale = user.locale === 'de-AT' ? 'de-AT' : 'de-DE';

      // ── Thread resolution (before any state is built, so a rejected id never
      // reaches the pipeline) ──
      // Reuse a client-supplied thread only if this user may actually write to
      // it. `canAccessThread` enforces owner / explicit permission / public /
      // group-shared — the same gate ChatGraph uses for its message writes — and
      // rejects non-UUID ids, which chat_threads.id (uuid) would otherwise turn
      // into a Postgres 22P02. Anything it rejects mints a fresh thread instead
      // of erroring the stream.
      let activeThreadId = threadId ?? undefined;
      if (activeThreadId && !(await canAccessThread(ThreadId(activeThreadId), UserId(userId)))) {
        log.warn(
          `[SearchGraph] threadId "${activeThreadId}" not accessible for user ${userId} — minting a new thread`
        );
        activeThreadId = undefined;
      }
      if (!activeThreadId) {
        const thread = await createThread(
          userId,
          persistedAgentId,
          query?.substring(0, 100) || 'Suche',
          'search'
        );
        activeThreadId = thread.id;
        sse.sendRaw('thread_created', { threadId: activeThreadId });
      } else {
        await touchThread(activeThreadId);
      }

      const inputMessages: WireMessage[] =
        messages && messages.length > 0
          ? messages
          : [{ role: 'user' as const, content: query ?? '' }];
      const normalizedMessages = normalizeWireMessages(inputMessages);

      // Initialize state
      let state = await initializeSearchState({
        query: query || '',
        messages: normalizedMessages as ModelMessage[],
        threadId: activeThreadId,
        searchMode: searchMode ?? 'web',
        aiWorkerPool: req.app.locals.aiWorkerPool as AIWorkerPool,
        userLocale,
      });

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
        return { status: 200 as const, body: undefined };
      }

      // ── Step 1: Query Planning ──
      sse.sendRaw('search_start', { message: 'Analysiere Suchanfrage...' });
      state = mergeState(state, await queryPlannerNode(state));

      if (abortController.signal.aborted) {
        sse.end();
        return { status: 200 as const, body: undefined };
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
        return { status: 200 as const, body: undefined };
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
        return { status: 200 as const, body: undefined };
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
        return { status: 200 as const, body: undefined };
      }

      // ── Step 4: Quality Gate (with loop) ──
      state = mergeState(
        state,
        (await qualityGateNode(state as unknown as ChatGraphState)) as Partial<SearchGraphState>
      );

      // Quality gate loop
      if (
        state.qualityScore > 0 &&
        state.qualityScore < 3 &&
        state.searchCount < state.maxSearches
      ) {
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
        return { status: 200 as const, body: undefined };
      }

      // ── Step 5: Build Response Context ──
      state = mergeState(state, await searchRespondNode(state));

      if (abortController.signal.aborted) {
        sse.end();
        return { status: 200 as const, body: undefined };
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
        return { status: 200 as const, body: undefined };
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

    return { status: 200 as const, body: undefined };
  },
});

export function mountSearchGraphContractRouter(app: Application): void {
  createExpressEndpoints(searchGraphContract, searchGraphContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'searchGraphContract'),
  });
}
