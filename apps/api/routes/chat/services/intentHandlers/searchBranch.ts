/**
 * The retrieval branch: everything the intent loop routes to a search — plus
 * the two @deepresearch engines, which replace the whole turn instead.
 */

import {
  briefGeneratorNode,
  buildCitations,
  rerankNode,
  searchNode,
} from '../../../../agents/langgraph/ChatGraph/index.js';
import { partitionSearchErrors } from '../../../../agents/langgraph/ChatGraph/types.js';
import { resolveSearchTier, resolveTier } from '../../../../services/search/searchDepth.js';
import { createLogger } from '../../../../utils/logger.js';
import { runDeepAgentTurn } from '../deepAgentTurn.js';
import { checkDeepResearchQuota, deepResearchQuotaSpentMessage } from '../deepResearchQuota.js';
import { runDeepResearchTurn } from '../deepResearchTurn.js';
import { withImageProxy } from '../searchImagePayload.js';
import { PROGRESS_MESSAGES, sendChatWarning, sendSearchDegradedWarning } from '../sseHelpers.js';
import { getKeptResearchForRetry } from '../threadPersistenceService.js';

import { reportUnavailableSources } from './unavailableSources.js';

import type {
  ChatGraphState,
  SearchIntent,
  SearchResult,
} from '../../../../agents/langgraph/ChatGraph/types.js';
import type { SearchResultPayload, SSEWriter } from '../sseHelpers.js';

const log = createLogger('ChatGraphController');

export async function runSearchBranch(opts: {
  state: ChatGraphState;
  /** The intent of THIS loop iteration, not the classifier's primary verdict. */
  currentIntent: SearchIntent;
  sse: SSEWriter;
  forcedTool: boolean;
  enabledTools?: Record<string, boolean> | undefined;
  /** Sources gathered by an earlier iteration, so this branch unions instead of replacing. */
  priorIntentResults: SearchResult[];
}): Promise<{
  state: ChatGraphState;
  /**
   * A deep-research engine served the whole turn. The loop must skip the rest
   * of the iteration — including the prior-source carry-over, whose sources
   * these answers never went through.
   */
  servedWholeTurn: boolean;
}> {
  const { sse, currentIntent, forcedTool, enabledTools, priorIntentResults } = opts;
  let finalState = opts.state;

  const toolEnabled = forcedTool || enabledTools?.[currentIntent] !== false;
  if (!toolEnabled) return { state: finalState, servedWholeTurn: false };

  // `intent` must follow the LOOP, not the classifier's primary verdict.
  // searchNode switches on `state.intent`, and the state threaded through
  // here still carried the primary — so a secondary search intent ran the
  // PRIMARY branch a second time. Live: "<tagesschau-URL> zusammenfassen"
  // classified web → scrape_url and issued the identical Linkup search
  // twice (paid, ~2 s each) while the pasted page was never crawled.
  let searchInputState = { ...finalState, intent: currentIntent } as ChatGraphState;

  // @deepresearch has two engines, tried in this order. Both replace BOTH
  // halves of the turn — retrieval and synthesis — and must therefore skip
  // everything below, not just the search node: reranking reorders
  // `searchResults`, and a finished answer's [N] point at the original
  // order. For both, `null` means "not served" (no key, failed run) and
  // falls through to the next one, with the warning already sent.

  // The shared daily allowance is settled HERE, once, for both engines:
  // they meter through one Redis key, and a per-engine limit against a
  // shared key made the verdict depend on which engine happened to run.
  let allowanceGone = false;
  const deepUserId = searchInputState.agentConfig?.userId ?? '';
  // No userId means no meter — both engines refuse on their own for that
  // reason, and asking the counter would fail closed and mis-report it as
  // a spent allowance.
  if (searchInputState.deepResearchRequested === true && deepUserId.length > 0) {
    const quota = await checkDeepResearchQuota(deepUserId);
    if (!quota.canResearch) {
      sendChatWarning(sse, 'deep_research_quota_spent', deepResearchQuotaSpentMessage(quota));
      allowanceGone = true;
    }
  }

  // First the agent, whenever it can run at all: it answers with a DOCUMENT
  // rather than a dossier, so on success there is nothing to rerank and no
  // source list to emit — only the short summary it put in
  // `deepResearchAnswer`.
  if (searchInputState.deepResearchRequested === true && !allowanceGone) {
    const report = await runDeepAgentTurn({ state: searchInputState, sse });
    if (report) {
      return {
        state: { ...searchInputState, ...report } as ChatGraphState,
        servedWholeTurn: true,
      };
    }
  }

  // Then Linkup's one-shot dossier, the path that always existed.
  if (searchInputState.deepResearchRequested === true && !allowanceGone) {
    const dossier = await runDeepResearchTurn({ state: searchInputState, sse });
    if (dossier) {
      finalState = { ...searchInputState, ...dossier } as ChatGraphState;
      sse.send('search_complete', {
        message: PROGRESS_MESSAGES.searchComplete(finalState.searchResults?.length ?? 0),
        resultCount: finalState.searchResults?.length ?? 0,
        results: (finalState.searchResults ?? []).slice(0, 10).map((r) => {
          const result: SearchResultPayload = {
            source: r.source,
            title: r.title,
            content: r.content,
          };
          if (r.url != null) result.url = r.url;
          return result;
        }),
      });
      return { state: finalState, servedWholeTurn: true };
    }
  }

  // A retry of a research turn whose GENERATION failed: the sources are
  // already on the thread. Re-running Linkup costs ~17s and a paid call
  // to answer the identical question a second time (observed live, 36s
  // after the sources had been persisted). Checked before the brief
  // generator so the whole retrieval half is skipped, not just the search.
  const reused =
    currentIntent === 'research' && finalState.threadId
      ? // swallow-ok: reine Ersparnis — scheitert sie, läuft die Recherche normal durch, teurer aber richtig
        await getKeptResearchForRetry(finalState.threadId, finalState.searchQuery ?? '').catch(
          () => null
        )
      : null;
  if (reused) {
    log.info(
      `[Research] Reusing ${reused.searchResults.length} source(s) kept from the failed attempt — skipping the repeat Linkup run`
    );
    searchInputState = {
      ...finalState,
      searchResults: reused.searchResults,
      citations: buildCitations(reused.searchResults),
    } as ChatGraphState;
  }

  const willGenerateBrief =
    !reused &&
    ['complex', 'moderate'].includes(finalState.complexity) &&
    currentIntent === 'research';
  const briefStepId = willGenerateBrief ? `brief_${Date.now()}` : null;
  if (willGenerateBrief && briefStepId) {
    // brief generator is a silent LLM call (~1–3s); ping so the UI doesn't
    // sit on the stale "intent" message during this window.
    sse.send('progress_step', {
      stepId: briefStepId,
      toolName: 'brief',
      title: 'Plane Recherche…',
      status: 'in_progress',
    });
    const briefResult = await briefGeneratorNode(finalState);
    searchInputState = { ...finalState, ...briefResult } as ChatGraphState;
    // The flag was set all along but only read by runChatGraph, which has
    // no callers — so a deep-research turn silently degraded to a flat
    // search while the progress copy still promised deep research.
    if (searchInputState.briefGenerationFailed) {
      sendChatWarning(sse, 'research_plan_failed');
    }
    sse.send('progress_step', {
      stepId: briefStepId,
      toolName: 'brief',
      title: 'Plane Recherche…',
      status: 'completed',
    });
  }

  // The progress line now follows the TIER, not the intent: "recherchiere"
  // no longer means a different engine, so promising "dauert 15–20s" on
  // every such turn would be a lie about a search that takes two.
  const searchTier = resolveSearchTier({
    intent: currentIntent,
    explicitDeep: searchInputState.explicitDeepRequest ?? false,
  });
  if (!reused) {
    const baseProgress =
      searchTier === 'standard' ? PROGRESS_MESSAGES.searchStart : resolveTier(searchTier).progress;
    // A site scope must be VISIBLE. It was extracted heuristically from the
    // user's wording, so a wrong read has to be recognisable as such —
    // otherwise the user sees results missing and has no way to tell that
    // the search was narrowed at all. Named in the progress line rather than
    // a new event field, because that line is already rendered everywhere.
    const scopeDomains = searchInputState.webSiteScope?.include ?? [];
    sse.send('search_start', {
      message:
        scopeDomains.length > 0
          ? `${baseProgress.replace(/[…\s]+$/, '')} — nur auf ${scopeDomains.join(', ')}…`
          : baseProgress,
      ...(finalState.subQueries?.length && { subQueries: finalState.subQueries }),
    });
    if (searchTier !== 'standard') {
      searchInputState = {
        ...searchInputState,
        onResearchProgress: (message: string) => {
          sse.send('search_start', { message });
        },
      } as ChatGraphState;
    }
  }
  // Reused sources ARE the search result — running the node would issue the
  // very Linkup call this branch exists to avoid.
  const searchResult = reused ? {} : await searchNode(searchInputState);
  finalState = { ...searchInputState, ...searchResult } as ChatGraphState;
  // searchNode REPLACES `searchResults`. With the loop now running two
  // genuinely different branches (e.g. web → scrape_url), the second one
  // would drop the first one's sources on the floor. Union them, this
  // iteration's results first (the secondary is the more specific ask —
  // a pasted page beats hits the engine merely found). Deduped by URL;
  // rerank re-orders right below.
  //
  // The guard reads the PRIOR results only, deliberately: an empty second
  // branch (crawl blocked by robots.txt, zero hits) still overwrites
  // `searchResults` with [] one line above, so also requiring the CURRENT
  // branch to be non-empty would wipe the first branch's sources — the
  // very failure this union exists to prevent, with the roles swapped.
  if (priorIntentResults.length > 0) {
    const merged = [...(finalState.searchResults ?? []), ...priorIntentResults];
    const seen = new Set<string>();
    const deduped = merged.filter((r) => {
      const key = r.url ?? `${r.source}:${r.title}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    finalState = {
      ...finalState,
      searchResults: deduped,
      citations: buildCitations(deduped),
    } as ChatGraphState;
  }

  if (finalState.searchResults?.length > 2) {
    const rerankStepId = `rerank_${Date.now()}`;
    sse.send('progress_step', {
      stepId: rerankStepId,
      toolName: 'rerank',
      title: 'Bewerte Quellen…',
      status: 'in_progress',
    });
    const rerankResult = await rerankNode(finalState);
    finalState = { ...finalState, ...rerankResult } as ChatGraphState;
    if (finalState.searchResults.length > 0) {
      finalState.citations = buildCitations(finalState.searchResults);
    }
    // Same dead-flag story as briefGenerationFailed: without reranking the
    // model grounds on input order, so the top sources may be the weakest.
    if (finalState.rerankFailed) sendChatWarning(sse, 'rerank_degraded');
    sse.send('progress_step', {
      stepId: rerankStepId,
      toolName: 'rerank',
      title: 'Bewerte Quellen…',
      status: 'completed',
    });
  }

  const resultCount = finalState.searchResults?.length || 0;
  const payloadResults =
    finalState.searchResults?.slice(0, 10).map((r) => {
      const result: SearchResultPayload = {
        source: r.source,
        title: r.title,
        content: r.content,
      };
      if (r.url != null) result.url = r.url;
      if (r.relevance != null) result.relevance = r.relevance;
      return result;
    }) || [];
  // Degraded search (Qdrant/web source unreachable) must be
  // distinguishable from a genuine zero-hit — both for the user
  // (warning toast + status copy) and for monitoring.
  const {
    coreDegraded: searchDegraded,
    unavailableSources,
    needsReauth,
  } = partitionSearchErrors(finalState.searchErrors);
  if (searchDegraded) sendSearchDegradedWarning(sse, resultCount);
  // A file the user explicitly attached or @-mentioned that could not be
  // read. These were collected but filtered away by the availability
  // predicate, so the answer simply omitted the source without a word.
  if (unavailableSources.length > 0) {
    reportUnavailableSources(sse, finalState, unavailableSources, needsReauth);
  }
  sse.send('search_complete', {
    message:
      searchDegraded && resultCount === 0
        ? PROGRESS_MESSAGES.searchDegraded
        : PROGRESS_MESSAGES.searchComplete(resultCount),
    resultCount,
    results: payloadResults,
    // Only present on a turn that explicitly asked for images. Travels
    // beside `results`, never inside it — an image has no text, so as a
    // source it would be a numbered citation with an empty snippet.
    ...(finalState.webImageResults?.length
      ? { images: finalState.webImageResults.map(withImageProxy) }
      : {}),
    ...((currentIntent === 'examples' || currentIntent === 'pressemitteilung_examples') &&
    finalState.examplesResult
      ? { examplesResult: finalState.examplesResult }
      : {}),
  });

  return { state: finalState, servedWholeTurn: false };
}
