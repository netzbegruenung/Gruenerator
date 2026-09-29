/**
 * GreenPT Search Service
 *
 * Thin client around GreenPT's link-search endpoint
 * (`POST /v1/tools/search/web`). Which searches reach it is decided by the
 * provider chain in `webSearch.ts`, not here.
 *
 * Two GreenPT endpoints exist and they are not interchangeable. The other one,
 * `/v1/tools/websearch`, scrapes pages and returns `relevant_content`; it was
 * measured and rejected twice (31.07. and 29.09.2026: 2–3 hits whatever
 * `count` says, 5–15s, `site:` stripped, navigation chrome inside the
 * "LLM-ready" content). THIS one returns ranked links with a ~230-char
 * `description` each, up to 20 hits, ~1.2–1.4s p50 — on par with Linkup, and
 * for factual lookups sourced at least as well (29.09.2026: answer in the top
 * five 16/16 against Linkup's 15/16, with ministries and Wikipedia where Linkup
 * returned SEO calculator pages).
 *
 * ── The failure mode this module exists to contain ─────────────────────────
 *
 * The endpoint periodically stops searching and answers `HTTP 200` with
 * `{"results": []}`. No 429, no error body, no header movement. In July this
 * tracked sustained load (a token bucket: ≥1 req/5s was clean); by September it
 * no longer did — the same queries came back 15/24 empty in one minute and
 * 30/30 full the next, at the same rate, and twelve parallel calls were fine.
 * A client-side spacing gate therefore buys nothing and was removed; what
 * contains it is:
 *
 *   1. An empty result set is a FAILURE, not an answer (`GreenPTEmptyError`).
 *      It is the only observable signal, and passed through as "the web has
 *      nothing on this" the chat would answer ungrounded with nothing in the
 *      logs to say why. The provider chain moves on to the next engine.
 *   2. The circuit breaker: two failures in a row and GreenPT rests for five
 *      minutes, so an empty window is not re-paid by every search in it.
 */

import { env } from '../../config/env.js';
import { createLogger } from '../../utils/logger.js';
import { recordOperation } from '../usage/UsageTrackingService.js';

import { CircuitBreaker } from './searchRetryStrategy.js';

const log = createLogger('GreenPTSearch');

const GREENPT_SEARCH_URL = 'https://api.greenpt.ai/v1/tools/search/web';

/**
 * Short by design. Another engine stands behind GreenPT in the chain, so a slow
 * GreenPT is strictly worse than no GreenPT. Healthy calls land at 1.1–1.6s.
 */
const GREENPT_TIMEOUT_MS = 5_000;

/**
 * The endpoint's real ceiling. The docs advertise `maxResults` 1–50; until
 * August anything above 10 came back as 10, on 29.09.2026 20 came back as 20.
 */
export const GREENPT_MAX_RESULTS = 20;

/** Same shape and thresholds as `linkupCircuit` and `searxngCircuit`. */
const greenptCircuit = new CircuitBreaker({
  failureThreshold: 2,
  resetTimeMs: 5 * 60 * 1000,
  label: 'GreenPTSearch',
});

/** An empty `results` array — the outage's only tell. See the header. */
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

export class GreenPTSearchService {
  constructor(private readonly apiKey: string) {}

  /**
   * Ranked links for a query.
   *
   * Throws rather than returning an empty list — see `GreenPTEmptyError`.
   */
  async webSearch(params: {
    query: string;
    maxResults?: number;
    /**
     * Lower-case ISO country code (`'de'`, `'at'`). Upper case is a 400, and a
     * locale like `'de-DE'` is accepted and silently ignored — which is what
     * this client sent until 29.09.2026. Moves only queries whose terms are
     * already regional ("Richtwertmieten": 1 → 9 AT hosts of 10); a generic
     * query needs the country in its text, see `localizeQuery`.
     */
    country?: 'de' | 'at';
  }): Promise<GreenPTSearchResult[]> {
    if (greenptCircuit.isOpen()) {
      throw new Error('GreenPT circuit open — provider considered unavailable');
    }

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
          ...(params.country ? { country: params.country } : {}),
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
 * The service when `GREENPT_API_KEY` is set, null otherwise. Whether searches
 * reach it is `WEB_SEARCH_CHAIN`'s decision, not the key's.
 */
export function getGreenPTSearchService(): GreenPTSearchService | null {
  if (!env.GREENPT_API_KEY) return null;
  if (!_instance) {
    _instance = new GreenPTSearchService(env.GREENPT_API_KEY);
    log.info('[GreenPTSearch] Service initialized');
  }
  return _instance;
}

/** Test-only: reset singleton and circuit. */
export function _resetGreenPTSearchServiceForTests(): void {
  _instance = null;
  greenptCircuit.reset();
}
