/**
 * Twitter/X Trends Scraper.
 * Scrapes trends24.in for top trending topics, one page per monitor locale
 * (Germany and Austria). Direct fetch first; Linkup's fetcher when trends24
 * refuses the request (it answers the production server with 403).
 */

import { createLogger } from '../../utils/logger.js';
import { urlCrawler } from '../scrapers/implementations/UrlCrawler/index.js';
import { getLinkupService } from '../search/LinkupService.js';

import { MONITOR_LOCALES, type MonitorLocale, type SocialTrend } from './types.js';

const log = createLogger('TwitterTrends');

const TRENDS_URLS: Record<MonitorLocale, string> = {
  de: 'https://trends24.in/germany/',
  at: 'https://trends24.in/austria/',
};

const LOCALE_LABELS: Record<MonitorLocale, string> = {
  de: 'Germany',
  at: 'Austria',
};

/** Navigation/boilerplate lines the last-resort text extraction must not take for trends. */
const BOILERPLATE_LINE =
  /^(home|about|privacy|contact|trends|worldwide|germany|deutschland|austria|österreich|oesterreich)/i;

export interface TwitterTrend {
  rank: number;
  name: string;
  url: string;
}

/** Pull the ranked trends out of trends24's trend links. */
function parseLinkedTrends(html: string): TwitterTrend[] {
  const trends: TwitterTrend[] = [];
  const seen = new Set<string>();
  const push = (name: string) => {
    if (!name || name.length < 2 || seen.has(name.toLowerCase())) return;
    seen.add(name.toLowerCase());
    trends.push({
      rank: trends.length + 1,
      name,
      url: `https://x.com/search?q=${encodeURIComponent(name)}`,
    });
  };

  // trends24.in uses <a> tags with trend names inside trend list items
  // Pattern: links to twitter search like /germany/#hashtag or x.com/search
  const trendPattern =
    /<a[^>]*href="https?:\/\/(?:twitter\.com|x\.com)\/search\?q=([^"&]+)"[^>]*>([^<]+)<\/a>/gi;
  let match;
  while ((match = trendPattern.exec(html)) !== null) push(match[2].trim());

  // Fallback: try extracting from trend-card links
  if (trends.length === 0) {
    const fallbackPattern =
      /<li[^>]*class="[^"]*trend-card[^"]*"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/gi;
    while ((match = fallbackPattern.exec(html)) !== null) push(match[1].trim());
  }

  return trends;
}

/** Last resort: any text line that looks like a trend. */
async function parseTextTrends(html: string, trendsUrl: string): Promise<TwitterTrend[]> {
  const contentExtractor =
    await import('../scrapers/implementations/UrlCrawler/extractors/ContentExtractor.js');
  const extractor = new contentExtractor.ContentExtractor();
  const content = extractor.extractContent(html, trendsUrl);

  const trends: TwitterTrend[] = [];
  const seen = new Set<string>();
  const lines = content.content
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length >= 2 && l.length <= 50);
  for (const line of lines) {
    if (seen.has(line.toLowerCase())) continue;
    // Skip navigation/boilerplate
    if (BOILERPLATE_LINE.test(line)) continue;
    seen.add(line.toLowerCase());

    trends.push({
      rank: trends.length + 1,
      name: line,
      url: `https://x.com/search?q=${encodeURIComponent(line)}`,
    });

    if (trends.length >= 50) break;
  }
  return trends;
}

/**
 * trends24.in answers the production server with 403 while the same request
 * from elsewhere goes through, so a refused or trend-less direct fetch is
 * retried through Linkup's fetcher. Direct stays first: it costs nothing.
 */
async function fetchViaLinkup(trendsUrl: string, label: string): Promise<string | null> {
  const linkup = getLinkupService();
  if (!linkup) return null;
  try {
    return await linkup.fetchPage(trendsUrl);
  } catch (error) {
    log.error(`Twitter trends Linkup fetch for ${label} failed: ${error}`);
    return null;
  }
}

export async function scrapeTwitterTrends(locale: MonitorLocale): Promise<TwitterTrend[]> {
  const trendsUrl = TRENDS_URLS[locale];
  const label = LOCALE_LABELS[locale];
  log.info(`Scraping Twitter trends for ${label}...`);

  try {
    let html: string | null = null;
    try {
      html = (await urlCrawler.fetchUrl(trendsUrl, { timeout: 15000 })).html;
    } catch (error) {
      log.warn(`Twitter trends direct fetch for ${label} failed: ${error}`);
    }

    let trends = html ? parseLinkedTrends(html) : [];
    if (trends.length === 0) {
      const linkupHtml = await fetchViaLinkup(trendsUrl, label);
      if (linkupHtml) {
        html = linkupHtml;
        trends = parseLinkedTrends(linkupHtml);
        log.info(`Fetched Twitter trends for ${label} via Linkup`);
      }
    }
    if (trends.length === 0 && html) trends = await parseTextTrends(html, trendsUrl);

    log.info(`Scraped ${trends.length} Twitter trends for ${label}`);
    return trends.slice(0, 50);
  } catch (error) {
    log.error(`Twitter trends scrape for ${label} failed: ${error}`);
    return [];
  }
}

/**
 * Scrape every monitor locale in parallel. A locale that fails contributes an
 * empty list instead of taking the whole refresh down.
 */
export async function scrapeTrendsByLocale(): Promise<Record<MonitorLocale, SocialTrend[]>> {
  const entries = await Promise.all(
    MONITOR_LOCALES.map(
      async (locale) => [locale, await scrapeTwitterTrends(locale).catch(() => [])] as const
    )
  );
  return Object.fromEntries(entries) as Record<MonitorLocale, SocialTrend[]>;
}

/**
 * Read the trends for one locale out of a stored snapshot.
 *
 * `legacyTrends` is the single German list that `monitor_snapshots.social_trends`
 * held before trends were scraped per locale. Rows written back then carry no
 * Austrian trends at all — falling back to the German list for `at` would be
 * exactly the bug this replaced, so Austria gets an empty list until the next
 * refresh.
 */
export function pickTrendsForLocale(
  byLocale: Partial<Record<MonitorLocale, SocialTrend[]>> | null,
  legacyTrends: SocialTrend[] | null,
  locale: MonitorLocale
): SocialTrend[] {
  const stored = byLocale?.[locale];
  if (stored && stored.length > 0) return stored;
  return locale === 'de' ? (legacyTrends ?? []) : [];
}
