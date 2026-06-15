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

const log = createLogger('ChatGraph:Rerank');

function getSourceTag(source: string): string {
  if (source.startsWith(SOURCE_PREFIX.GRUENERATOR)) return 'Parteidokument';
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

  // Includes agents bound to a notebook via `defaultNotebookId` so they get the
  // same deeper rerank window as an explicitly selected notebook.
  const isNotebookScoped =
    (state.notebookCollectionIds?.length ?? 0) > 0 ||
    (state.defaultNotebookCollectionIds?.length ?? 0) > 0 ||
    (state.notebookDocumentIds?.length ?? 0) > 0;
  const inputLimit = isNotebookScoped ? 20 : rerankCfg.inputLimit;
  const outputLimit = isNotebookScoped ? 12 : rerankCfg.outputLimit;

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
      content: r.content.slice(0, 300),
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
