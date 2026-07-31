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

/**
 * Damping for distilled candidates, against the optimizer's curse.
 *
 * A distilled page was assembled by picking the passages that scored HIGHEST
 * with this same cross-encoder against this same query. Re-scoring that is a
 * biased maximum, not a neutral relevance estimate — while a Qdrant party
 * document sits here raw. Undamped, distilled web hits would systematically
 * outrank the party documents the instruct above explicitly asks to prefer, and
 * eat their share of the prompt budget.
 *
 * A calibration constant with no theory behind it. The `[Distill]` telemetry is
 * how it gets tuned; it is not a number to defend, only one to measure.
 */
const DISTILL_SCORE_SHRINK = 0.85;

/** Recency weight when the question is temporal. 0 leaves ranking untouched. */
const RECENCY_WEIGHT = 0.15;
/** Age at which the freshness bonus has fully decayed. */
const RECENCY_HALFLIFE_DAYS = 365;

function shrinkDistilled(score: number, r: { distilled?: boolean | undefined }): number {
  return r.distilled === true ? score * DISTILL_SCORE_SHRINK : score;
}

/**
 * Deterministic freshness bonus, applied only on temporal questions.
 *
 * Deliberately NOT an instruction to the cross-encoder: it never sees a date,
 * and it is not trained on date arithmetic. A source without a date gets no
 * bonus and no penalty — the provider not reporting one says nothing about the
 * source. For "wer war Marilyn Monroe" this is off entirely, because there
 * preferring recent material is actively wrong.
 */
function applyRecency(
  score: number,
  r: { publishedDate?: string | null | undefined },
  hasTemporal: boolean | undefined
): number {
  if (!hasTemporal || !r.publishedDate) return score;
  const published = Date.parse(r.publishedDate);
  if (Number.isNaN(published)) return score;
  const ageDays = (Date.now() - published) / 86_400_000;
  if (ageDays < 0) return score;
  const freshness = Math.max(0, 1 - ageDays / RECENCY_HALFLIFE_DAYS);
  return score * (1 + RECENCY_WEIGHT * freshness);
}

/**
 * Text handed to the cross-encoder for one candidate.
 *
 * For a distilled page the digest can exceed the excerpt, and its passages sit
 * in DOCUMENT order — so a plain head slice would score whatever happened to
 * come first rather than what the selection actually found.
 */
function rerankExcerpt(r: {
  content: string;
  distilledChunks?: Array<{ text: string; score: number }> | undefined;
}): string {
  const chunks = r.distilledChunks;
  if (!chunks || chunks.length === 0 || r.content.length <= RERANK_EXCERPT_CHARS) {
    return r.content.slice(0, RERANK_EXCERPT_CHARS);
  }
  const best = [...chunks].sort((a, b) => b.score - a.score);
  const out: string[] = [];
  let used = 0;
  for (const chunk of best) {
    if (used > 0 && used + chunk.text.length > RERANK_EXCERPT_CHARS) break;
    out.push(chunk.text);
    used += chunk.text.length + 2;
  }
  return (out.join('\n\n') || r.content).slice(0, RERANK_EXCERPT_CHARS);
}

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
  // No temporal hint. It used to ask the cross-encoder to "prefer recent
  // sources" over text that carries no date at all — an instruction it had no
  // way to follow. Recency is applied deterministically below instead.
  const instruct = `${baseInstruct}${sourceHint}`;

  const queryStr = researchBrief ? `${searchQuery}\n${researchBrief}` : searchQuery || '';

  const items: RerankableItem[] = candidates.map((r) => {
    const item: RerankableItem = {
      title: r.title,
      // The cross-encoder scores THIS text, so the excerpt decides which sources
      // survive. At 300 chars a crawled page whose relevant passage sits further
      // in was judged on its boilerplate header — a selection loss that then
      // propagates into everything downstream.
      //
      // A distilled page is already the relevant part, but it can exceed the
      // excerpt: score its best passage rather than whatever the budget put
      // first, or the selection work is thrown away at the node it was for.
      content: rerankExcerpt(r),
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
    const base = scores.get(i) ?? candidate.relevance ?? DEFAULT_RELEVANCE;
    return [
      {
        ...candidate,
        source: candidate.source ?? '',
        relevance: applyRecency(shrinkDistilled(base, candidate), candidate, hasTemporal),
      },
    ];
  });

  // Named so the two adjustments are auditable in production: a shrink that
  // never fires means the distillation never reached the reranker, and a
  // recency count of 0/n on a temporal turn means the dates were dropped
  // upstream again — the exact failure this replaced.
  const distilledCount = reranked.filter((r) => r.distilled === true).length;
  const datedCount = reranked.filter((r) => r.publishedDate != null).length;
  log.info(
    `[Rerank] Complete: ${candidates.length} → ${reranked.length} results (diversity applied) in ${rerankTimeMs}ms` +
      ` distilled=${distilledCount} dated=${datedCount}${hasTemporal ? ' recency=on' : ''}`
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
