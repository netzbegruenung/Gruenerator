/**
 * GreenPT Rerank Service
 *
 * `POST /v1/rerank` with `green-rerank`, which is Qwen3-Reranker-4B. It is the
 * only reranker: when it is unavailable, `rerankPipeline` degrades to input
 * order.
 *
 * History: reranking moved here from Regolo on 2026-08-28, a host swap for
 * identical weights (same rank order, top score 0.8437 vs 0.8409 on a probe;
 * 52-case retrieval eval Hit@1 40.4 % vs 38.5 %, i.e. noise). `RERANK_MIN_RELEVANCE`
 * was calibrated against Regolo scores; GreenPT's sit about 0.010 lower at the
 * median (paired, 1046 document pairs), which cuts ~2.6 % more documents at the
 * 0.2 threshold, all inside the 0.15-0.20 band. Callers that pass `minKeep: 5`
 * (`rerankNotebookResults`, the research router) are covered; `rerankNode` and
 * `pastChatRecallService` pass none, so if reranked result counts look thinner
 * than expected, that band is where to look.
 *
 * GreenPT returns an `impact` object (energy, emissions) that feeds the
 * "Nutzung" tab. It is NOT documented on docs.greenpt.ai (only `usage` and
 * `inferenceTiming` are), verified on the live endpoint. `parseImpact` returns
 * null on absence, so if it vanishes reranking keeps working and only the
 * measurement stops.
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
 * Hence the circuit breaker: two consecutive failures and this host is skipped
 * for five minutes, during which reranking is off and callers keep input order.
 *
 * "Failure" deliberately includes TIMEOUTS and network errors, not only the
 * 429/503 that motivated the breaker — a hang is the more expensive outage of
 * the two: left uncounted, it would burn the full `RERANK_TIMEOUT_MS` on EVERY
 * rerank for as long as it lasts. What stays uncounted is a 4xx other than
 * 429: that is our own bug, and it should stay loud rather than be muffled by
 * an open circuit.
 */

import { env } from '../../config/env.js';
import { createLogger } from '../../utils/logger.js';
import { parseImpact } from '../ai/greenptImpact.js';
import { recordImpact } from '../usage/UsageTrackingService.js';

import { CircuitBreaker } from './searchRetryStrategy.js';

const log = createLogger('GreenPTRerank');

export interface RerankRequest {
  query: string;
  documents: string[];
  topN?: number;
  instruct?: string;
}

export interface RerankResultItem {
  originalIndex: number;
  relevanceScore: number;
  text: string;
}

const GREENPT_RERANK_URL = 'https://api.greenpt.ai/v1/rerank';
const RERANK_MODEL = 'green-rerank';

/**
 * Hard ceiling per call: `fetch` has no default timeout, and a hang would stall
 * the whole turn. `rerankPipeline` catches the abort and degrades to input
 * order. Healthy calls land at ~0.6s wall clock (40-55ms of it inference).
 */
const RERANK_TIMEOUT_MS = 4000;

interface GreenPTRerankResponse {
  results: Array<{ index: number; relevance_score: number }>;
}

/** `timedOut` distinguishes a hang (full timeout spent) from a fast failure (429, 503, auth, parse). */
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

  /** False when unkeyed or when the breaker is open — callers keep input order. */
  isAvailable(): boolean {
    return Boolean(env.GREENPT_RERANK_ENABLED && env.GREENPT_API_KEY) && !this.breaker.isOpen();
  }

  async rerank(request: RerankRequest): Promise<RerankResultItem[]> {
    const apiKey = env.GREENPT_API_KEY;
    if (!apiKey) throw new GreenPTRerankError('GREENPT_API_KEY is not configured', false);

    const { query, documents, topN, instruct } = request;
    const instructText =
      instruct || 'Given a search query, retrieve relevant passages that answer the query';

    // The wrapping is what Qwen3-Reranker was trained on.
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
      // Counted, unlike a 4xx — see the header.
      this.breaker.recordFailure();
      throw new GreenPTRerankError(
        timedOut
          ? `GreenPT rerank timed out after ${RERANK_TIMEOUT_MS}ms`
          : `GreenPT rerank request failed: ${error instanceof Error ? error.message : String(error)}`,
        timedOut
      );
    }

    if (!response.ok) {
      // 429 (account-wide budget) and 503 (model at capacity) mean "come back
      // later" and count. Any other 4xx is our own bug and must not.
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
      recordImpact({ provider: 'greenpt', model: RERANK_MODEL, ...impact });
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
