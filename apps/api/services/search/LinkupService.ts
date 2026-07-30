/**
 * Linkup Service
 *
 * Thin client around the Linkup agentic-search API (https://docs.linkup.so).
 * Two orthogonal knobs — depth (fast|standard|deep) and outputType:
 *   - webSearch    → outputType=searchResults, depth per call. The chat's only
 *                    retrieval door; WE write the answer and own the [N].
 *   - deepResearch → depth=deep, outputType=sourcedAnswer. LINKUP writes the
 *                    answer. Used by the Monitor's daily briefing pipeline, no
 *                    longer by the chat — a chat answer the model didn't write
 *                    cannot be cited against our own source registry.
 *
 * Which tier picks which depth is NOT decided here — see `searchDepth.ts`.
 *
 * Deliberately not using Linkup's own AI-SDK package (`linkup-ai-sdk`): it is a
 * tool wrapper for the AI-SDK path only, while most of our searches come from the
 * classifier path, which calls no tool — we would end up with two ways to reach
 * Linkup, and the second one would bypass `recordOperation` below, our only
 * per-search cost accounting. The option NAMES here mirror that package's
 * signature so a later switch stays mechanical.
 *
 * Gated by env.LINKUP_API_KEY presence — getLinkupService() returns null when
 * the key is unset, leaving existing code paths intact.
 */

import { env } from '../../config/env.js';
import { createLogger } from '../../utils/logger.js';
import { recordOperation } from '../usage/UsageTrackingService.js';

import { withRetry, CircuitBreaker } from './searchRetryStrategy.js';

const log = createLogger('Linkup');

/**
 * Breaker for the Linkup API. Two consecutive failures open it for five minutes —
 * the same thresholds as `searxngCircuit`, because the failure it guards against
 * is the same one: a provider that is down for everyone, retried per query.
 *
 * Deliberately NOT gated on the response status: a 429 and a 503 both mean "stop
 * asking for a while", and we pay per search either way.
 */
const linkupCircuit = new CircuitBreaker({
  failureThreshold: 2,
  resetTimeMs: 5 * 60 * 1000,
  label: 'Linkup',
});

const LINKUP_API_BASE = 'https://api.linkup.so/v1';
const LINKUP_TIMEOUT_MS = 60_000;

export interface LinkupSource {
  name: string;
  url: string;
  snippet: string;
  favicon?: string;
}

export interface LinkupSearchResult {
  name: string;
  url: string;
  content: string;
  type?: string;
  /**
   * Publication date, when Linkup knows one. ISO-ish string, not guaranteed
   * parseable — the mapper treats it as a hint, not a fact.
   *
   * The field was in the API all along and we never read it, so `publishedDate`
   * was hard-coded `null` for every web hit and the recency ranking
   * (`recencyBoost` / `resolveSourceDate`) silently scored nothing at all on the
   * one source type where freshness matters most.
   */
  date?: string;
}

export interface LinkupSearchResultsResponse {
  results: LinkupSearchResult[];
}

export interface LinkupSourcedAnswerResponse {
  answer: string;
  sources: LinkupSource[];
}

export type LinkupLocale = 'de' | 'at' | 'eu';

/**
 * Linkup's three engine depths (docs: Search best practices → Choosing depth):
 *
 *   fast     — <1s, keyword-only, NO LLM. The query reaches the index verbatim;
 *              instructions inside it are read as search terms.
 *   standard — 1–3s, one iteration of agentic search. Interprets the query, can
 *              fan out into parallel sub-searches, can scrape one URL from it.
 *   deep     — 5–30s, multi-iteration search-and-scrape chaining with
 *              evaluation. For work whose later steps depend on earlier ones.
 *
 * An earlier version of this type claimed there were only two and that "there is
 * no third depth to reach for". There is, and it is the cheap one.
 */
export type LinkupDepth = 'fast' | 'standard' | 'deep';

/**
 * Linkup's own recommendation for buying breadth without buying depth: on
 * `standard` the agent fans out into parallel sub-searches when the query asks
 * it to. It goes into the query string rather than a parameter because that is
 * how the API takes it — the query carries both what to retrieve and how.
 *
 * Never appended on `fast`: that depth has no LLM and would dutifully search for
 * the words "führe", "mehrere", "Suchen".
 */
const ADJACENT_SEARCHES_INSTRUCTION =
  'Führe mehrere Suchen mit angrenzenden Stichwörtern durch, um das Thema breit abzudecken.';

export class LinkupService {
  constructor(private readonly apiKey: string) {}

  /**
   * searchResults output at any engine depth — the chat's single retrieval door.
   *
   * We keep `searchResults` (never `sourcedAnswer`) here on purpose: our model
   * writes the answer, so every [N] resolves against our own source registry.
   */
  async webSearch(params: {
    query: string;
    depth?: LinkupDepth;
    maxResults?: number;
    /**
     * Restrict the search to these domains, or keep them out of it. Bare hosts
     * ("zeit.de"), no scheme. Applied by the engine BEFORE we pay for the
     * results — which is the whole point: our old low-value-domain list threw
     * hits away after the call, so we were paying for results we discarded.
     * (LobeChat and Open WebUI both filter after the call too; LobeChat's
     * adapters even declare these very parameters and never fill them.)
     */
    includeDomains?: readonly string[];
    excludeDomains?: readonly string[];
    /** ISO date (YYYY-MM-DD). Index-side time window. */
    fromDate?: string;
    toDate?: string;
    /** Ask the agent to fan out across adjacent keywords within this one call. */
    adjacentSearches?: boolean;
  }): Promise<LinkupSearchResultsResponse> {
    const depth = params.depth ?? 'standard';
    // Guard rather than trust the caller: `fast` has no LLM, so an instruction
    // appended here would become search terms. `resolveSearchPlan` already makes
    // the combination unrepresentable; this keeps a hand-rolled call honest too.
    const query =
      params.adjacentSearches && depth !== 'fast'
        ? `${params.query}\n${ADJACENT_SEARCHES_INSTRUCTION}`
        : params.query;
    return this.call<LinkupSearchResultsResponse>('/search', {
      q: query,
      depth,
      outputType: 'searchResults',
      ...(params.maxResults ? { maxResults: params.maxResults } : {}),
      // Empty arrays are omitted, not sent: `includeDomains: []` reads to the API
      // as "restrict to nothing at all", which would return zero results for a
      // caller that merely had no preference.
      ...(params.includeDomains?.length ? { includeDomains: [...params.includeDomains] } : {}),
      ...(params.excludeDomains?.length ? { excludeDomains: [...params.excludeDomains] } : {}),
      ...(params.fromDate ? { fromDate: params.fromDate } : {}),
      ...(params.toDate ? { toDate: params.toDate } : {}),
    });
  }

  /** deep depth, sourcedAnswer output — Linkup writes the report itself.
   *  Monitor pipeline only (HotTopicPipeline); the chat routes through
   *  `webSearch` at every tier so citations stay ours. */
  async deepResearch(params: {
    question: string;
    locale?: LinkupLocale;
  }): Promise<LinkupSourcedAnswerResponse> {
    const prompt = buildDeepResearchPrompt(params.question, params.locale);
    return this.call<LinkupSourcedAnswerResponse>('/search', {
      q: prompt,
      depth: 'deep',
      outputType: 'sourcedAnswer',
    });
  }

  private async call<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const url = `${LINKUP_API_BASE}${path}`;
    // A Linkup outage used to cost 2 attempts × 60s PER QUERY, and every query in
    // the turn paid it again — a dead provider turned a 3s answer into minutes of
    // waiting before the fallback ran. The breaker makes the second query fail
    // instantly so the caller reaches its SearXNG/empty path while the user is
    // still watching. Same instance shape as `searxngCircuit`.
    if (linkupCircuit.isOpen()) {
      throw new Error('Linkup circuit open — provider considered unavailable');
    }
    // One logical search per call — withRetry retries inside, so this counts
    // user-visible researches rather than HTTP attempts.
    recordOperation({
      unit: 'searches',
      provider: 'linkup',
      model: typeof body.depth === 'string' ? body.depth : 'standard',
    });
    try {
      const result = await this.request<T>(url, body);
      linkupCircuit.recordSuccess();
      return result;
    } catch (error) {
      linkupCircuit.recordFailure();
      throw error;
    }
  }

  private async request<T>(url: string, body: Record<string, unknown>): Promise<T> {
    return withRetry(
      async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), LINKUP_TIMEOUT_MS);
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify(body),
            signal: controller.signal,
          });
          if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(`Linkup ${res.status}: ${text.slice(0, 200)}`);
          }
          return (await res.json()) as T;
        } finally {
          clearTimeout(timeout);
        }
      },
      { maxRetries: 1, delayMs: 500, label: 'Linkup' }
    );
  }
}

function buildDeepResearchPrompt(question: string, locale?: LinkupLocale): string {
  const localeHint =
    locale === 'de'
      ? 'Fokussiere dich auf deutsche Quellen und Kontext (Deutschland).'
      : locale === 'at'
        ? 'Fokussiere dich auf österreichische Quellen und Kontext (Österreich).'
        : locale === 'eu'
          ? 'Fokussiere dich auf europäische Quellen und Kontext (EU).'
          : '';
  return [
    `Du bist Recherche-Assistent für die Partei Bündnis 90/Die Grünen.`,
    `Beantworte folgende Frage gründlich auf Deutsch:`,
    ``,
    question,
    ``,
    localeHint,
    ``,
    `Strukturiere die Antwort mit Markdown-Überschriften (## ...) und gib für jede`,
    `zentrale Aussage einen Inline-Quellennachweis im Format [N] an (1-basiert, in der`,
    `Reihenfolge der Quellenliste). Vermeide Halluzinationen. Verwende Genderstern`,
    `(z.B. Politiker*innen) und das informelle "du".`,
  ]
    .filter(Boolean)
    .join('\n');
}

let _instance: LinkupService | null = null;

/**
 * Returns a singleton LinkupService when LINKUP_API_KEY is set, null otherwise.
 * Callers branch on null to fall through to existing SearXNG / orchestrator paths.
 */
export function getLinkupService(): LinkupService | null {
  if (!env.LINKUP_API_KEY) return null;
  if (!_instance) {
    _instance = new LinkupService(env.LINKUP_API_KEY);
    log.info('[Linkup] Service initialized');
  }
  return _instance;
}

/** Test-only: reset the singleton. Used by vitest's beforeEach. */
export function _resetLinkupServiceForTests(): void {
  _instance = null;
}
