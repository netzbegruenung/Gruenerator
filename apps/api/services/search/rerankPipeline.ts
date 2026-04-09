/**
 * Shared Rerank Pipeline
 *
 * Unified reranking logic used by both ChatGraph (rerankNode) and Notebook
 * (rerankNotebookResults). Calls Regolo's cross-encoder, filters by relevance,
 * and optionally applies MMR diversity reranking.
 *
 * Returns ranked indices (not items) so callers can map back to their own types.
 */

import { vectorConfig } from '../../config/vectorConfig.js';
import { createLogger } from '../../utils/logger.js';

import { applyMMR } from './DiversityReranker.js';
import { regoloRerankService } from './RegoloRerankService.js';

const log = createLogger('RerankPipeline');

export interface RerankableItem {
  title: string;
  content: string;
  source?: string;
  relevance?: number;
}

export interface RerankPipelineOptions {
  query: string;
  items: RerankableItem[];
  inputLimit?: number;
  outputLimit?: number;
  minRelevance?: number;
  minKeep?: number;
  applyDiversity?: boolean;
  mmrLambda?: number;
  mmrKeepTop?: number;
  instruct?: string;
  sourceTagFn?: (item: RerankableItem) => string;
}

export interface RerankPipelineResult {
  rankedIndices: number[];
  scores: Map<number, number>;
  rerankTimeMs: number;
}

const SKIP_THRESHOLD = 2;
export const DEFAULT_RELEVANCE = 0.5;

export async function rerankPipeline(
  options: RerankPipelineOptions
): Promise<RerankPipelineResult> {
  const startTime = Date.now();
  const rerankCfg = vectorConfig.get('rerank');

  const {
    query,
    items,
    inputLimit = rerankCfg.inputLimit,
    outputLimit = rerankCfg.outputLimit,
    minRelevance = rerankCfg.minRelevance,
    minKeep = 0,
    applyDiversity = true,
    mmrLambda = rerankCfg.mmrLambda,
    mmrKeepTop = rerankCfg.mmrKeepTop,
    instruct,
    sourceTagFn,
  } = options;

  if (items.length <= SKIP_THRESHOLD) {
    log.info(`Skipping — only ${items.length} items`);
    return {
      rankedIndices: items.map((_, i) => i),
      scores: new Map(items.map((item, i) => [i, item.relevance ?? DEFAULT_RELEVANCE])),
      rerankTimeMs: Date.now() - startTime,
    };
  }

  const candidates = items.slice(0, inputLimit);

  try {
    const documents = candidates.map((item) => {
      const tag = sourceTagFn ? `[${sourceTagFn(item)}] ` : '';
      return `${tag}${item.title}\n${item.content}`;
    });

    const rerankResults = await regoloRerankService.rerank({
      query,
      documents,
      topN: inputLimit,
      instruct,
    });

    const scoreMap = new Map<number, number>();
    for (const r of rerankResults) {
      scoreMap.set(r.originalIndex, r.relevanceScore);
    }

    // Build scored items with original indices for filtering + MMR
    const scored = candidates.map((item, i) => ({
      index: i,
      relevance: scoreMap.get(i) ?? item.relevance ?? DEFAULT_RELEVANCE,
      title: item.title,
      content: item.content,
    }));

    scored.sort((a, b) => b.relevance - a.relevance);

    // Filter by minRelevance, but always keep at least minKeep
    const filtered = scored.filter((s, i) => s.relevance > minRelevance || i < minKeep);

    let finalOrder: typeof filtered;

    if (applyDiversity && filtered.length > 3) {
      const indexByIdentity = new Map(filtered.map((s) => [`${s.title}\0${s.content}`, s.index]));

      const mmrResult = applyMMR(
        filtered.map((s) => ({ title: s.title, content: s.content, relevance: s.relevance })),
        mmrLambda,
        mmrKeepTop
      );

      finalOrder = mmrResult.map((r) => ({
        index: indexByIdentity.get(`${r.title}\0${r.content}`) ?? 0,
        relevance: r.relevance ?? DEFAULT_RELEVANCE,
        title: r.title ?? '',
        content: r.content,
      }));
    } else {
      finalOrder = filtered;
    }

    const result = finalOrder.slice(0, outputLimit);
    const rerankTimeMs = Date.now() - startTime;

    log.info(
      `${candidates.length} → ${result.length} results (diversity=${applyDiversity}) in ${rerankTimeMs}ms`
    );

    return {
      rankedIndices: result.map((r) => r.index),
      scores: scoreMap,
      rerankTimeMs,
    };
  } catch (error: unknown) {
    log.error('Rerank error:', error instanceof Error ? error.message : String(error));
    return {
      rankedIndices: candidates.map((_, i) => i).slice(0, outputLimit),
      scores: new Map(candidates.map((item, i) => [i, item.relevance ?? DEFAULT_RELEVANCE])),
      rerankTimeMs: Date.now() - startTime,
    };
  }
}
