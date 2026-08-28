/**
 * GreenPT Rerank Service
 *
 * `POST /v1/rerank` with `green-rerank`, which is Qwen3-Reranker-4B — the exact
 * model Regolo serves under its own name. This is a host swap, not a model
 * swap, and that is the whole reason it is safe: the score distribution the
 * `RERANK_MIN_RELEVANCE` threshold is calibrated against does not move.
 *
 * Measured 2026-08-28 against both hosts, same four German documents, same
 * `<Instruct>`/`<Document>` wrapping we already send:
 *
 *     rank order   GreenPT  2,3,1,0     Regolo  2,3,1,0     (identical)
 *     top score    GreenPT  0.8437      Regolo  0.8409
 *     tail score   GreenPT  0.2201      Regolo  0.2261
 *
 * And on the real corpus, `evals/retrieval/runRetrievalEval.ts` with
 * `EVAL_RERANK=1`, 52 cases against live Qdrant, the two arms selected with
 * `GREENPT_RERANK_ENABLED`. Retrieval before reranking was byte-identical in
 * both runs (Hit@1 55.8 %, MRR 0.686), so only the host moved:
 *
 *     after rerank   Hit@1    Hit@3    Hit@5    MRR@10
 *     GreenPT        40.4 %   71.2 %   76.9 %   0.569
 *     Regolo         38.5 %   71.2 %   75.0 %   0.559
 *
 * That gap is ONE case out of 52 — noise, not an improvement. The claim it
 * supports is only the negative one: switching host costs no retrieval quality.
 *
 * One thing that eval does NOT cover: it runs with `minRelevance: 0`, so it
 * scores ordering and never exercises the threshold. GreenPT's scores sit
 * consistently ~0.02-0.05 BELOW Regolo's on the same input (0.427/0.472,
 * 0.685/0.706, 0.453/0.475), and against a fixed `RERANK_MIN_RELEVANCE` of 0.2
 * that can drop a borderline candidate the other host would have kept — seen
 * once in a five-document probe. Small, one-directional, and unmeasured on the
 * production corpus. If reranked result counts ever look thinner than expected,
 * this is the first place to look.
 *
 * WHY SWITCH AT ALL: GreenPT returns an `impact` object and Regolo returns
 * nothing. Reranking was a blind spot in the footprint the "Nutzung" tab shows
 * — every rerank call was real energy attributed to no one. Verified on the
 * live endpoint, and NOT documented on docs.greenpt.ai (which shows only
 * `usage.total_tokens` and `inferenceTiming`):
 *
 *     "impact": { "version": "20250922", "inferenceTime": {...},
 *                 "energy": {"total": 4126, "unit": "Wms"},
 *                 "emissions": {"total": 64, "unit": "ugCO2e"} }
 *
 * Because it is undocumented it may vanish without notice. `parseImpact`
 * returns null on absence and nothing else depends on it, so the day it goes
 * away reranking keeps working and only the measurement stops.
 *
 * ── The constraint this file has to respect ────────────────────────────────
 *
 * GreenPT's rate limit is 600 requests / 15 min PER ACCOUNT, shared across
 * every endpoint and every key — the same budget the planner lane
 * (`autoPolicy`, Mistral Small on GreenPT) and `GreenPTSearchService` spend
 * from. Reranking is by far the most frequent of the three: one call per
 * search plus one per crawled page via `PassageDistiller`. So this client must
 * never be the reason a chat turn's planner call gets a 429.
 *
 * Hence the circuit breaker: two consecutive 429/503s and this host is skipped
 * for five minutes, with Regolo carrying reranking in the meantime. The
 * measurement is the thing we give up under load, not the ranking.
 */

import { env } from '../../config/env.js';
import { createLogger } from '../../utils/logger.js';
import { parseImpact } from '../ai/greenptImpact.js';
import { recordImpact } from '../usage/UsageTrackingService.js';

import { CircuitBreaker } from './searchRetryStrategy.js';

import type { RerankRequest, RerankResultItem } from './RegoloRerankService.js';

const log = createLogger('GreenPTRerank');

const GREENPT_RERANK_URL = 'https://api.greenpt.ai/v1/rerank';
const RERANK_MODEL = 'green-rerank';

/**
 * Tighter than Regolo's 8s on purpose. This host is only ever tried with Regolo
 * standing behind it, so the two timeouts stack in the worst case — see
 * `rerankPipeline`, which refuses to fall back after a TIMEOUT for exactly that
 * reason. Healthy calls land at ~0.6s wall clock (40-55ms of it inference).
 */
const RERANK_TIMEOUT_MS = 4000;

interface GreenPTRerankResponse {
  results: Array<{ index: number; relevance_score: number }>;
}

/**
 * `timedOut` is the signal the pipeline routes on: a fast failure (429, 503,
 * auth, parse) leaves the turn's latency budget intact and is worth retrying on
 * Regolo; a timeout has already spent it and must not be paid for twice.
 */
export class GreenPTRerankError extends Error {
  constructor(
    message: string,
    readonly timedOut: boolean
  ) {
    super(message);
    this.name = 'GreenPTRerankError';
  }
}

class GreenPTRerankService {
  private readonly breaker = new CircuitBreaker({
    failureThreshold: 2,
    resetTimeMs: 5 * 60 * 1000,
    label: 'GreenPTRerank',
  });

  /** Test seam: the breaker is process-wide state and would leak between cases. */
  resetBreakerForTests(): void {
    this.breaker.reset();
  }

  /** False when unkeyed or when the breaker is open — the caller skips straight to Regolo. */
  isAvailable(): boolean {
    return Boolean(env.GREENPT_RERANK_ENABLED && env.GREENPT_API_KEY) && !this.breaker.isOpen();
  }

  async rerank(request: RerankRequest): Promise<RerankResultItem[]> {
    const apiKey = env.GREENPT_API_KEY;
    if (!apiKey) throw new GreenPTRerankError('GREENPT_API_KEY is not configured', false);

    const { query, documents, topN, instruct } = request;
    const instructText =
      instruct || 'Given a search query, retrieve relevant passages that answer the query';

    // Byte-identical to what Regolo receives. The wrapping is what the model
    // was trained on, and keeping it is what makes the two hosts comparable.
    const formattedQuery = `<Instruct>: ${instructText}\n<Query>: ${query}`;
    const formattedDocuments = documents.map((doc) => `<Document>: ${doc}`);

    const startTime = Date.now();

    let response: Response;
    try {
      response = await fetch(GREENPT_RERANK_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: RERANK_MODEL,
          query: formattedQuery,
          documents: formattedDocuments,
          ...(topN && { top_n: topN }),
          // The caller already holds the texts and indexes back into them, so
          // echoing them costs bandwidth for nothing.
          return_documents: false,
        }),
        signal: AbortSignal.timeout(RERANK_TIMEOUT_MS),
      });
    } catch (error: unknown) {
      const timedOut = error instanceof Error && error.name === 'TimeoutError';
      throw new GreenPTRerankError(
        timedOut
          ? `GreenPT rerank timed out after ${RERANK_TIMEOUT_MS}ms`
          : `GreenPT rerank request failed: ${error instanceof Error ? error.message : String(error)}`,
        timedOut
      );
    }

    if (!response.ok) {
      // 429 (account-wide budget) and 503 (model at capacity) are the two the
      // breaker exists for — both mean "come back later", not "this is broken".
      if (response.status === 429 || response.status === 503) this.breaker.recordFailure();
      const errorText = await response.text().catch(() => '');
      throw new GreenPTRerankError(
        `GreenPT rerank API error ${response.status}: ${errorText.slice(0, 200)}`,
        false
      );
    }

    const data = (await response.json()) as GreenPTRerankResponse & Record<string, unknown>;
    this.breaker.recordSuccess();

    const impact = parseImpact(data);
    if (impact) {
      recordImpact({
        provider: 'greenpt',
        model: RERANK_MODEL,
        energyWms: impact.energyWms,
        emissionsUg: impact.emissionsUg,
      });
    }

    const results: RerankResultItem[] = data.results.map((r) => ({
      originalIndex: r.index,
      relevanceScore: r.relevance_score,
      text: documents[r.index] ?? '',
    }));

    log.info(
      `Reranked ${documents.length} docs in ${Date.now() - startTime}ms — top score: ${results[0]?.relevanceScore.toFixed(3) ?? 'N/A'}${impact ? `, ${impact.emissionsUg}ugCO2e` : ', impact absent'}`
    );

    return results;
  }
}

export const greenptRerankService = new GreenPTRerankService();
