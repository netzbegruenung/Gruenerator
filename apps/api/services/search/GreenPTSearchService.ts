/**
 * GreenPT Search Service
 *
 * Thin client around GreenPT's link-search endpoint
 * (`POST /v1/tools/search/web`), used as the cheap first door for SIMPLE web
 * searches, with Linkup behind it as the fallback for everything else.
 *
 * Two GreenPT endpoints exist and they are not interchangeable. The other one,
 * `/v1/tools/websearch`, scrapes pages and returns `relevant_content`; it was
 * measured and rejected (hard cap at ~3 hits, 4.2s p50, `site:` stripped,
 * navigation chrome inside the "LLM-ready" content). THIS one returns ranked
 * links with a ~230-char `description` each, 10 hits, 1.2–1.6s p50 — faster than
 * Linkup and, for factual lookups, sourced at least as well.
 *
 * Why the short snippets are not the disqualifier they look like: the chat
 * truncates EVERY source to 300 chars before the model sees it
 * (`snippetChars` in directSearchExecutors), and 88% of these descriptions are
 * already shorter than that. Measured over 12 fact questions with an objective
 * answer regex, at that same 300-char budget, the answer was present in the top
 * five hits 12/12 times (Linkup: 11/12).
 *
 * ── The failure mode this module exists to contain ─────────────────────────
 *
 * Above roughly one request per five seconds SUSTAINED, the endpoint stops
 * searching and answers `HTTP 200` with `{"results": []}` in ~500ms (healthy
 * calls take ~1400ms). There is no 429, no error body, and no header movement —
 * `ratelimit-remaining` sat at 549/600 while every second response came back
 * empty. Measured, 14 calls per step, all queries distinct:
 *
 *     1 req / 1s → 50% empty      1 req / 3s →  7% empty
 *     1 req / 2s → 21% empty      1 req / 5s →  0% empty
 *
 * Bursts are fine — six concurrent calls came back 6/6 — so this is a token
 * bucket draining under sustained load, not a rate limiter. The documented
 * "600 requests / 15 min" does not describe it.
 *
 * Hence the two rules below, which are the whole point of this file:
 *
 *   1. An empty result set is a FAILURE, not an answer (`GreenPTEmptyError`).
 *      It is the only observable signal the throttle gives us, and if it were
 *      passed through as "the web has nothing on this", the chat would answer
 *      ungrounded and nothing in the logs would say why.
 *   2. Calls are gated to one per `MIN_CALL_GAP_MS`, and a call that arrives
 *      inside that window is REFUSED rather than delayed — the caller drops to
 *      Linkup immediately. Queueing would trade a provider we are trying to
 *      save money on against the one thing a chat search cannot spend, which is
 *      the user's waiting time.
 */

import { env } from '../../config/env.js';
import { createLogger } from '../../utils/logger.js';
import { recordOperation } from '../usage/UsageTrackingService.js';

import { CircuitBreaker } from './searchRetryStrategy.js';

const log = createLogger('GreenPTSearch');

const GREENPT_SEARCH_URL = 'https://api.greenpt.ai/v1/tools/search/web';

/**
 * Short by design. This provider is only ever tried when Linkup is available as
 * the fallback, so a slow GreenPT is strictly worse than no GreenPT: waiting
 * 10s to save half a cent costs the turn more than the search is worth. Healthy
 * calls land at 1.2–1.6s; the throttled ones return in ~500ms.
 */
const GREENPT_TIMEOUT_MS = 5_000;

/**
 * Minimum spacing between two GreenPT searches in this process.
 *
 * 5s is where the measured empty rate hits zero (3s still leaked 7%). It is a
 * per-process gate, and the API runs in cluster mode, so N workers can still
 * produce N/5 requests per second between them. That is deliberate: the gate is
 * a cheap way to keep a single worker's own loop from beating the provider
 * into the ground, not a distributed rate limiter. The circuit breaker below is
 * what actually contains a provider-wide stall, and both of them are backstops
 * — correctness never depends on either, because every path falls back to
 * Linkup.
 */
const MIN_CALL_GAP_MS = 5_000;

/**
 * The endpoint's real ceiling. The docs advertise `maxResults` 1–50; 20 and 50
 * both come back with 10, so anything above this is a request we cannot serve
 * and must not pretend to.
 */
export const GREENPT_MAX_RESULTS = 10;

/**
 * Two consecutive failures open the circuit for five minutes — same shape and
 * thresholds as `linkupCircuit` and `searxngCircuit`. Since a throttled GreenPT
 * stays throttled for minutes at a time, this is what stops every search in
 * that window from paying ~500ms to discover the same thing again.
 */
const greenptCircuit = new CircuitBreaker({
  failureThreshold: 2,
  resetTimeMs: 5 * 60 * 1000,
  label: 'GreenPTSearch',
});

/** An empty `results` array — the throttle's only tell. See the header. */
export class GreenPTEmptyError extends Error {
  constructor() {
    super('GreenPT returned zero results (throttled or genuinely empty)');
    this.name = 'GreenPTEmptyError';
  }
}

export interface GreenPTSearchResult {
  url: string;
  title: string;
  /** The snippet. Averages ~230 chars. Never absent in practice, but the API
   *  does not promise it, and an entry without one is useless as a source. */
  description?: string;
  position?: number;
  favicon?: string;
}

interface GreenPTSearchResponse {
  results?: GreenPTSearchResult[];
}

/** Last call's start time, for the spacing gate. Module-level: one per worker. */
let lastCallStartedAt = 0;

export class GreenPTSearchService {
  constructor(private readonly apiKey: string) {}

  /**
   * Ranked links for a query.
   *
   * Throws rather than returning an empty list — see `GreenPTEmptyError`. Every
   * caller is expected to catch and fall back.
   */
  async webSearch(params: {
    query: string;
    maxResults?: number;
    /** Language/region bias, e.g. "de-DE". A weak bias, not a filter: for
     *  "climate policy" it moved 3 of 10 hosts, and the query's own language
     *  dominates it. Passed through because it costs nothing. */
    language?: string;
  }): Promise<GreenPTSearchResult[]> {
    if (greenptCircuit.isOpen()) {
      throw new Error('GreenPT circuit open — provider considered unavailable');
    }
    const since = Date.now() - lastCallStartedAt;
    if (since < MIN_CALL_GAP_MS) {
      // Refused, not queued. The caller has Linkup ready and the user is waiting.
      throw new Error(`GreenPT rate gate — ${since}ms since last call, need ${MIN_CALL_GAP_MS}ms`);
    }
    lastCallStartedAt = Date.now();

    recordOperation({ unit: 'searches', provider: 'greenpt', model: 'search-web' });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GREENPT_TIMEOUT_MS);
    try {
      const res = await fetch(GREENPT_SEARCH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          query: params.query,
          maxResults: Math.min(params.maxResults ?? 5, GREENPT_MAX_RESULTS),
          ...(params.language ? { country: params.language } : {}),
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`GreenPT ${res.status}: ${text.slice(0, 200)}`);
      }
      const body = (await res.json()) as GreenPTSearchResponse;
      // A result without a URL cannot be cited; one without a description is an
      // empty numbered source in the registry. Both are dropped here so the
      // emptiness check below sees what the caller would actually be able to use.
      const usable = (body.results ?? []).filter(
        (r) => typeof r.url === 'string' && r.url.length > 0 && (r.description ?? '').length > 0
      );
      if (usable.length === 0) {
        greenptCircuit.recordFailure();
        throw new GreenPTEmptyError();
      }
      greenptCircuit.recordSuccess();
      return usable;
    } catch (error) {
      // `recordFailure` is already counted for the empty case; counting it twice
      // would open the circuit on a single stalled call.
      if (!(error instanceof GreenPTEmptyError)) greenptCircuit.recordFailure();
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

let _instance: GreenPTSearchService | null = null;

/**
 * The service when GreenPT web search is switched on, null otherwise.
 *
 * Gated on an EXPLICIT flag, not merely on the key: `GREENPT_API_KEY` is already
 * set in production for chat completions and transcription, so keying off its
 * presence alone would have silently swapped the chat's search engine the moment
 * this file landed.
 */
export function getGreenPTSearchService(): GreenPTSearchService | null {
  if (!env.GREENPT_SEARCH_ENABLED || !env.GREENPT_API_KEY) return null;
  if (!_instance) {
    _instance = new GreenPTSearchService(env.GREENPT_API_KEY);
    log.info('[GreenPTSearch] Service initialized (simple-query lane)');
  }
  return _instance;
}

/** Test-only: reset singleton, circuit and rate gate. */
export function _resetGreenPTSearchServiceForTests(): void {
  _instance = null;
  greenptCircuit.reset();
  lastCallStartedAt = 0;
}
