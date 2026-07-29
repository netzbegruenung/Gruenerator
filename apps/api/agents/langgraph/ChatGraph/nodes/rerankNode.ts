/**
 * Rerank Node
 *
 * Uses the shared rerankPipeline (Regolo cross-encoder + MMR diversity)
 * to rerank search results by semantic relevance. Sits between the search
 * and respond nodes in the graph pipeline.
 *
 * Adds source-type tags so the cross-encoder can leverage provenance info.
 */

import { vectorConfig } from '../../../../config/vectorConfig.js';
import {
  DEFAULT_RELEVANCE,
  rerankPipeline,
  type RerankableItem,
} from '../../../../services/search/rerankPipeline.js';
import { createLogger } from '../../../../utils/logger.js';
import { SOURCE_PREFIX, type ChatGraphState } from '../types.js';

import { MAX_SOURCES } from './citableSources.js';

const log = createLogger('ChatGraph:Rerank');

/** Excerpt per candidate handed to the cross-encoder. */
const RERANK_EXCERPT_CHARS = 1200;

/** Upper bound on survivors. Was the notebook path's hardcoded value. */
const RERANK_OUTPUT_CEILING = 12;

function getSourceTag(source: string): string {
  if (source.startsWith(SOURCE_PREFIX.GRUENERATOR)) return 'Parteidokument';
  // Official DIP records. Untagged they fell through to the generic 'Quelle'
  // while the instruct below tells the cross-encoder to prefer "official party
  // documents" — harmless while a turn is all-DIP (one tag for every
  // candidate), but it would rank a crawled web text above a Plenarprotokoll
  // the moment DIP and collection results ever share one pool.
  if (source === SOURCE_PREFIX.BUNDESTAG) return 'Parlamentsdokument';
  if (source.startsWith(SOURCE_PREFIX.DOCUMENT)) return 'Nutzerdokument';
  if (source === SOURCE_PREFIX.WEB) return 'Web';
  if (source === SOURCE_PREFIX.EXAMPLES) return 'Beispiel';
  if (source === SOURCE_PREFIX.RESEARCH) return 'Recherche';
  return 'Quelle';
}

export async function rerankNode(state: ChatGraphState): Promise<Partial<ChatGraphState>> {
  const startTime = Date.now();
  const { searchResults, searchQuery, hasTemporal, researchBrief } = state;
  const rerankCfg = vectorConfig.get('rerank');

  // Includes agents bound to notebooks via `defaultNotebookIds` so they get the
  // same deeper rerank window as an explicitly selected notebook.
  const isNotebookScoped =
    (state.notebookCollectionIds?.length ?? 0) > 0 ||
    (state.defaultNotebookCollectionIds?.length ?? 0) > 0 ||
    (state.notebookDocumentIds?.length ?? 0) > 0;

  // The window follows what actually arrived, not a fixed config value.
  // RERANK_INPUT_LIMIT (16) sits BELOW what the top search tier fetches
  // (`tiefenrecherche`: 20 via searchDepth.ts TIER_CONFIG), so the last results
  // were paid for at Linkup and then dropped before the cross-encoder ever
  // scored them — a silent loss on the most expensive tier. Deriving the window
  // from `searchResults.length` makes that impossible by construction and needs
  // no `tier` field on ChatGraphState.
  //
  // MAX_SOURCES is the ceiling on what can reach the prompt at all, so scoring
  // beyond it would be work whose result is discarded — and it keeps a wide
  // multi-source fan-out from running away.
  const inputLimit = Math.min(
    MAX_SOURCES,
    Math.max(isNotebookScoped ? MAX_SOURCES : rerankCfg.inputLimit, searchResults.length)
  );
  // Survivors scale with the input: never fewer than configured, never more than
  // the 12 the notebook path already used before this was unified.
  const outputLimit = Math.min(
    RERANK_OUTPUT_CEILING,
    Math.max(rerankCfg.outputLimit, searchResults.length)
  );

  if (searchResults.length <= 2) {
    log.info(`[Rerank] Skipping — only ${searchResults.length} results`);
    return { rerankTimeMs: Date.now() - startTime };
  }

  const candidates = searchResults.slice(0, inputLimit);

  log.info(
    `[Rerank] Reranking ${candidates.length} results for query: "${searchQuery?.slice(0, 50)}..."`
  );

  const baseInstruct = 'Given a search query, retrieve relevant passages that answer the query.';
  const sourceHint = ' Prefer official party documents and verified sources over web snippets.';
  const temporalHint = hasTemporal ? ' Prefer recent sources.' : '';
  const instruct = `${baseInstruct}${sourceHint}${temporalHint}`;

  const queryStr = researchBrief ? `${searchQuery}\n${researchBrief}` : searchQuery || '';

  const items: RerankableItem[] = candidates.map((r) => {
    const item: RerankableItem = {
      title: r.title,
      // The cross-encoder scores THIS text, so the excerpt decides which sources
      // survive. At 300 chars a crawled page whose relevant passage sits further
      // in was judged on its boilerplate header — a selection loss that then
      // propagates into everything downstream.
      content: r.content.slice(0, RERANK_EXCERPT_CHARS),
      source: r.source,
    };
    if (r.relevance != null) {
      item.relevance = r.relevance;
    }
    return item;
  });

  const pipelineResult = await rerankPipeline({
    query: queryStr,
    items,
    inputLimit,
    outputLimit,
    instruct,
    sourceTagFn: (item) => getSourceTag(item.source || ''),
  });
  const { rankedIndices, scores, rerankTimeMs } = pipelineResult;

  const reranked = rankedIndices.flatMap((i) => {
    const candidate = candidates[i];
    if (!candidate) return [];
    return [
      {
        ...candidate,
        source: candidate.source ?? '',
        relevance: scores.get(i) ?? candidate.relevance ?? DEFAULT_RELEVANCE,
      },
    ];
  });

  log.info(
    `[Rerank] Complete: ${candidates.length} → ${reranked.length} results (diversity applied) in ${rerankTimeMs}ms`
  );

  // Top cross-encoder confidence — quality gate reads this to decide whether
  // its LLM coverage check is needed. Null on failure so the gate falls back
  // to its existing LLM path (safety net preserved).
  const scoreValues = Array.from(scores.values());
  const topRerankScore = scoreValues.length > 0 ? Math.max(...scoreValues) : null;

  if (pipelineResult.failed) {
    log.error(
      `[Rerank] Cross-encoder failed; returning input order. error=${pipelineResult.error}`
    );
    return {
      searchResults: reranked,
      rerankTimeMs,
      rerankFailed: true,
      topRerankScore: null,
      searchErrors: [
        { source: 'rerank', message: pipelineResult.error ?? 'rerank failed (unknown error)' },
      ],
    };
  }

  return {
    searchResults: reranked,
    rerankTimeMs,
    topRerankScore,
  };
}
