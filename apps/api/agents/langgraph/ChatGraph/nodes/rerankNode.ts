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
import { rerankPipeline, type RerankableItem } from '../../../../services/search/rerankPipeline.js';
import { createLogger } from '../../../../utils/logger.js';

import type { ChatGraphState } from '../types.js';

const log = createLogger('ChatGraph:Rerank');

function getSourceTag(source: string): string {
  if (source.startsWith('gruenerator:')) return 'Parteidokument';
  if (source.startsWith('document')) return 'Nutzerdokument';
  if (source === 'web') return 'Web';
  if (source === 'examples') return 'Beispiel';
  if (source === 'research') return 'Recherche';
  return 'Quelle';
}

export async function rerankNode(state: ChatGraphState): Promise<Partial<ChatGraphState>> {
  const startTime = Date.now();
  const { searchResults, searchQuery, hasTemporal, researchBrief } = state;
  const rerankCfg = vectorConfig.get('rerank');

  const isNotebookScoped = (state.notebookCollectionIds?.length ?? 0) > 0;
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

  const items: RerankableItem[] = candidates.map((r) => ({
    title: r.title,
    content: r.content.slice(0, 300),
    source: r.source,
    relevance: r.relevance,
  }));

  const { rankedIndices, scores, rerankTimeMs } = await rerankPipeline({
    query: queryStr,
    items,
    inputLimit,
    outputLimit,
    instruct,
    sourceTagFn: (item) => getSourceTag(item.source || ''),
  });

  const reranked = rankedIndices.map((i) => ({
    ...candidates[i],
    relevance: scores.get(i) ?? candidates[i].relevance ?? 0.5,
  }));

  log.info(
    `[Rerank] Complete: ${candidates.length} → ${reranked.length} results (diversity applied) in ${rerankTimeMs}ms`
  );

  return {
    searchResults: reranked,
    rerankTimeMs,
  };
}
