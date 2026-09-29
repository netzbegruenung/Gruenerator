/**
 * Web search — the one door every caller goes through.
 *
 * Callers describe WHAT they need (depth, count, domain scope, time window,
 * images, full page text, locale); which engine serves it is decided here, from
 * the ordered chain in `WEB_SEARCH_CHAIN` (env). Swapping or reordering engines
 * is a config change, not a code change — the same split `AI_LANES` makes for
 * models.
 *
 * The rule: the first provider in the chain that is configured AND can honour
 * every constraint of the request gets it. A provider that fails (throws) hands
 * the request to the next eligible one. A provider that cannot express a
 * constraint is skipped rather than asked — several engines accept unknown
 * parameters silently, so "ask and hope" would return a narrower search than
 * the caller commissioned without anything failing.
 *
 * What stays outside: Linkup's `sourcedAnswer` (`LinkupService.deepResearch`) —
 * that is not a search but a written report, and no second engine offers it.
 */

import { env, type WebSearchProviderId } from '../../config/env.js';
import { createLogger } from '../../utils/logger.js';

import { getGreenPTSearchService, GREENPT_MAX_RESULTS } from './GreenPTSearchService.js';
import { getLinkupService, type LinkupDepth, type LinkupSearchResult } from './LinkupService.js';
import { withRetry } from './searchRetryStrategy.js';
import { searxngService } from './SearxngService.js';

const log = createLogger('WebSearch');

export type { WebSearchProviderId };

export type WebSearchLocale = 'de-DE' | 'de-AT';

export interface WebSearchRequest {
  query: string;
  maxResults: number;
  /** Engine effort. `deep` = multi-step search-and-scrape. Default `standard`. */
  depth?: LinkupDepth;
  locale?: WebSearchLocale;
  /** Ask the engine to fan out across adjacent keywords within one call. A
   *  hint: engines without it simply run the plain search. */
  adjacentSearches?: boolean;
  /** Bare hosts. A HARD scope — only engines that enforce it are eligible. */
  includeDomains?: readonly string[];
  /** Bare hosts. Engines without native support filter them out after the call. */
  excludeDomains?: readonly string[];
  /** ISO YYYY-MM-DD. */
  fromDate?: string;
  toDate?: string;
  /** News category, for engines that have one. Callers express the recency
   *  itself through `fromDate`. */
  news?: boolean;
  includeImages?: boolean;
  /** Every hit must carry the page's own text, not a search snippet. */
  needsContent?: boolean;
}

export interface WebSearchHit {
  title: string;
  url: string;
  /** Page text or snippet — see `WebSearchRequest.needsContent`. Never empty. */
  content: string;
  /** As delivered by the engine; not guaranteed parseable. */
  date: string | null;
}

export interface WebSearchImage {
  title: string;
  url: string;
}

export interface WebSearchResponse {
  provider: WebSearchProviderId;
  hits: WebSearchHit[];
  images: WebSearchImage[];
  suggestions?: string[];
}

/** No configured provider can serve this request — nothing was asked of anyone. */
export class NoWebSearchProviderError extends Error {
  constructor(reason: string) {
    super(`No web search provider can serve this request (${reason})`);
    this.name = 'NoWebSearchProviderError';
  }
}

interface ProviderAdapter {
  available(): boolean;
  /** Why this engine cannot honour the request, or null when it can. */
  unsupported(req: WebSearchRequest): string | null;
  search(req: WebSearchRequest): Promise<Omit<WebSearchResponse, 'provider'>>;
}

// ── Locale ───────────────────────────────────────────────────────────────────

const AT_MARKER =
  /(österreich|oesterreich|austria|\bwien\b|\bgraz\b|\blinz\b|salzburg|innsbruck|klagenfurt|bregenz|eisenstadt|st\.? ?pölten|tirol|vorarlberg|kärnten|steiermark|burgenland|nationalrat|\.at\b)/i;

/** The user named another country — the question is not about Austria. */
const OTHER_COUNTRY = /(deutschland|bundesrepublik|germany|schweiz|switzerland)/i;

/**
 * An AT user's query, made to find Austrian sources.
 *
 * Measured 29.09.2026 over seven AT-specific queries (AT hosts in the top 10,
 * of 70): GreenPT 9 → 48, Linkup 26 → 48 with "Österreich" appended. A region
 * parameter alone does not do it — GreenPT's `country: 'at'` only moves
 * queries whose terms are already Austrian. Skipped when the query already
 * names Austria or an Austrian place (the suffix adds nothing), names another
 * country (the question is about there), or is scoped to named sites (the
 * suffix would narrow a search the user already aimed).
 */
export function localizeQuery(
  query: string,
  locale: WebSearchLocale | undefined,
  includeDomains?: readonly string[]
): string {
  if (locale !== 'de-AT' || includeDomains?.length) return query;
  if (AT_MARKER.test(query) || OTHER_COUNTRY.test(query)) return query;
  return `${query} Österreich`;
}

// ── Providers ────────────────────────────────────────────────────────────────

/**
 * Exact host after stripping `www.` — the same policy as `isLowValueDomain`
 * (domainFilters.ts): a suffix match would silently pull in subdomains nobody
 * vetted.
 */
function excludedBy(excludeDomains: readonly string[] | undefined): (url: string) => boolean {
  if (!excludeDomains?.length) return () => false;
  const blocked = new Set(excludeDomains.map((d) => d.toLowerCase().replace(/^www\./, '')));
  return (url) => {
    try {
      return blocked.has(new URL(url).hostname.toLowerCase().replace(/^www\./, ''));
    } catch {
      return false;
    }
  };
}

/** Headroom so a block list does not cost the caller its requested count. */
const EXCLUDE_HEADROOM = 5;

/**
 * GreenPT link search: ranked links with a ~230-char description, no dates, no
 * images, no domain scope. Excludes are applied after the call — it is free, so
 * there is nothing to save by filtering before — with a little headroom so the
 * filter does not eat the count. Nothing left after filtering is a failure, not
 * an answer: the next engine gets the search.
 */
const greenpt: ProviderAdapter = {
  available: () => getGreenPTSearchService() !== null,
  unsupported(req) {
    if (req.depth === 'deep') return 'deep';
    if (req.needsContent) return 'page text';
    if (req.includeDomains?.length) return 'domain scope';
    if (req.fromDate || req.toDate || req.news) return 'time window';
    if (req.includeImages) return 'images';
    if (req.maxResults > GREENPT_MAX_RESULTS) return `>${GREENPT_MAX_RESULTS} results`;
    return null;
  },
  async search(req) {
    const service = getGreenPTSearchService();
    if (!service) throw new Error('GreenPT not configured');
    const results = await service.webSearch({
      query: req.query,
      maxResults: Math.min(
        req.maxResults + (req.excludeDomains?.length ? EXCLUDE_HEADROOM : 0),
        GREENPT_MAX_RESULTS
      ),
      country: req.locale === 'de-AT' ? 'at' : 'de',
    });
    const excluded = excludedBy(req.excludeDomains);
    const hits = results
      .filter((r) => !excluded(r.url))
      .map((r) => ({ title: r.title, url: r.url, content: r.description ?? '', date: null }));
    if (hits.length === 0) throw new Error('GreenPT: every hit was on the block list');
    return { hits, images: [] };
  },
};

/** Linkup: every constraint natively, the only engine with `deep`. */
const linkup: ProviderAdapter = {
  available: () => getLinkupService() !== null,
  unsupported: () => null,
  async search(req) {
    const service = getLinkupService();
    if (!service) throw new Error('Linkup not configured');
    const run = (depth: LinkupDepth) =>
      service.webSearch({
        query: req.query,
        depth,
        maxResults: req.maxResults,
        adjacentSearches: req.adjacentSearches === true,
        ...(req.includeDomains?.length ? { includeDomains: req.includeDomains } : {}),
        ...(req.excludeDomains?.length ? { excludeDomains: req.excludeDomains } : {}),
        ...(req.fromDate ? { fromDate: req.fromDate } : {}),
        ...(req.toDate ? { toDate: req.toDate } : {}),
        ...(req.includeImages ? { includeImages: true } : {}),
      });
    const depth = req.depth ?? 'standard';
    // `fast` is flagged beta in Linkup's docs, so it is the one depth that could
    // be rejected for an account without anything else being wrong. A keyword
    // lookup must not fail over an optimisation: fall back to the depth we know
    // works, once, and say so in the log.
    const res = await (depth === 'fast'
      ? run('fast').catch((err: unknown) => {
          log.warn(
            `[Linkup] fast depth rejected (${err instanceof Error ? err.message : String(err)}) — retrying at standard`
          );
          return run('standard');
        })
      : run(depth));
    const { text, images } = partitionLinkupResults(res.results);
    return {
      hits: text
        .filter((r) => r.content?.trim())
        .map((r) => ({ title: r.name, url: r.url, content: r.content, date: r.date ?? null })),
      images: images.map((r) => ({ title: r.name, url: r.url })),
    };
  },
};

/**
 * Split Linkup's single result array into text hits and image hits.
 *
 * Classification is by exclusion, not by allow-list: anything NOT marked
 * `type: 'image'` counts as text. Linkup documents `text` and `image`, and a
 * hypothetical third type would still carry `content` — mapping it as text keeps
 * the source, while an allow-list would silently drop it. An entry claiming to be
 * an image but carrying no usable URL is dropped from both lists: a link is the
 * only thing we do with it.
 */
export function partitionLinkupResults(results: readonly LinkupSearchResult[]): {
  text: LinkupSearchResult[];
  images: LinkupSearchResult[];
} {
  const text: LinkupSearchResult[] = [];
  const images: LinkupSearchResult[] = [];
  for (const r of results) {
    if (r.type === 'image') {
      if (r.url && r.url.trim().length > 0) images.push(r);
      continue;
    }
    text.push(r);
  }
  return { text, images };
}

/**
 * SearXNG: opt-in last resort for dev/self-host (not in the default chain — it is
 * a hard-coded private instance). It DEGRADES rather than refuses on images and
 * `toDate`, because a flat search is still better than none at the end of the
 * chain. It refuses what would make the answer wrong rather than thinner: a
 * domain scope ("such auf zeit.de" answered from anywhere), `deep` and page
 * text (every caller asking for those has a better fallback of its own).
 */
const searxng: ProviderAdapter = {
  available: () => true,
  unsupported(req) {
    if (req.depth === 'deep') return 'deep';
    if (req.needsContent) return 'page text';
    if (req.includeDomains?.length) return 'domain scope';
    return null;
  },
  async search(req) {
    const timeRange = req.fromDate ? fromDateToTimeRange(req.fromDate) : undefined;
    const res = await withRetry(
      () =>
        searxngService.performWebSearch(req.query, {
          maxResults: Math.min(req.maxResults, 10),
          language: req.locale ?? 'de-DE',
          safesearch: 0,
          categories: req.news ? 'news' : 'general',
          page: 1,
          ...(timeRange ? { time_range: timeRange } : {}),
        }),
      { maxRetries: 1, delayMs: 500, label: 'WebSearch:searxng' }
    );
    // A SearXNG outage must not read as "the web has nothing on this".
    if (!res.success) throw new Error('SearXNG search failed');
    const excluded = excludedBy(req.excludeDomains);
    return {
      hits: (res.results ?? [])
        .filter((r) => !excluded(r.url))
        .map((r) => ({
          title: r.title,
          url: r.url,
          content: r.content || r.snippet || '',
          date: r.publishedDate ?? null,
        }))
        .filter((h) => h.content.length > 0),
      images: [],
      ...(res.suggestions?.length ? { suggestions: res.suggestions } : {}),
    };
  },
};

function fromDateToTimeRange(fromDate: string): string | undefined {
  const days = (Date.now() - Date.parse(fromDate)) / 86_400_000;
  if (!Number.isFinite(days)) return undefined;
  // A day of slack each: `fromDate` is a UTC calendar date, so "a week ago"
  // measures as 7.x days by the time it arrives here.
  if (days <= 2) return 'day';
  if (days <= 8) return 'week';
  if (days <= 32) return 'month';
  if (days <= 367) return 'year';
  return undefined;
}

const ADAPTERS: Readonly<Record<WebSearchProviderId, ProviderAdapter>> = {
  greenpt,
  linkup,
  searxng,
};

// ── Facade ───────────────────────────────────────────────────────────────────

/** Whether some configured engine in the chain could serve this request. */
export function canWebSearch(request: WebSearchRequest): boolean {
  return env.WEB_SEARCH_CHAIN.some(
    (id) => ADAPTERS[id].available() && ADAPTERS[id].unsupported(request) === null
  );
}

export async function webSearch(request: WebSearchRequest): Promise<WebSearchResponse> {
  const req: WebSearchRequest = {
    ...request,
    query: localizeQuery(request.query, request.locale, request.includeDomains),
  };
  const skipped: string[] = [];
  let lastError: unknown = null;

  for (const id of env.WEB_SEARCH_CHAIN) {
    const adapter = ADAPTERS[id];
    if (!adapter.available()) {
      skipped.push(`${id}: not configured`);
      continue;
    }
    const reason = adapter.unsupported(req);
    if (reason) {
      skipped.push(`${id}: ${reason}`);
      continue;
    }
    try {
      const res = await adapter.search(req);
      log.info(
        `[WebSearch] ${id} → ${res.hits.length} hits${res.images.length ? ` + ${res.images.length} images` : ''} for "${req.query}"${skipped.length ? ` (skipped ${skipped.join('; ')})` : ''}`
      );
      return { provider: id, ...res, hits: res.hits.slice(0, req.maxResults) };
    } catch (error) {
      lastError = error;
      skipped.push(`${id}: ${error instanceof Error ? error.message : String(error)}`);
      log.info(`[WebSearch] ${id} failed — trying next provider: ${skipped.at(-1)}`);
    }
  }

  if (lastError) throw lastError instanceof Error ? lastError : new Error(String(lastError));
  throw new NoWebSearchProviderError(skipped.join('; ') || 'empty chain');
}
