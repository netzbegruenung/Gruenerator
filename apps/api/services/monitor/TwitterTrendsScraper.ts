/**
 * Twitter/X Trends Scraper.
 * Scrapes trends24.in for top trending topics, one page per monitor locale
 * (Germany and Austria). Free, no API key needed.
 */

import { createLogger } from '../../utils/logger.js';
import { urlCrawler } from '../scrapers/implementations/UrlCrawler/index.js';

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

export async function scrapeTwitterTrends(locale: MonitorLocale): Promise<TwitterTrend[]> {
  const trendsUrl = TRENDS_URLS[locale];
  const label = LOCALE_LABELS[locale];
  log.info(`Scraping Twitter trends for ${label}...`);

  try {
    const result = await urlCrawler.fetchUrl(trendsUrl, { timeout: 15000 });
    const html = result.html;

    const trends: TwitterTrend[] = [];
    const seen = new Set<string>();

    // trends24.in uses <a> tags with trend names inside trend list items
    // Pattern: links to twitter search like /germany/#hashtag or x.com/search
    const trendPattern =
      /<a[^>]*href="https?:\/\/(?:twitter\.com|x\.com)\/search\?q=([^"&]+)"[^>]*>([^<]+)<\/a>/gi;
    let match;
    while ((match = trendPattern.exec(html)) !== null) {
      const name = match[2].trim();
      if (!name || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());

      trends.push({
        rank: trends.length + 1,
        name,
        url: `https://x.com/search?q=${encodeURIComponent(name)}`,
      });
    }

    // Fallback: try extracting from trend-card links
    if (trends.length === 0) {
      const fallbackPattern =
        /<li[^>]*class="[^"]*trend-card[^"]*"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/gi;
      while ((match = fallbackPattern.exec(html)) !== null) {
        const name = match[1].trim();
        if (!name || seen.has(name.toLowerCase()) || name.length < 2) continue;
        seen.add(name.toLowerCase());

        trends.push({
          rank: trends.length + 1,
          name,
          url: `https://x.com/search?q=${encodeURIComponent(name)}`,
        });
      }
    }

    // Second fallback: extract any text that looks like a trend from the page content
    if (trends.length === 0) {
      const contentExtractor =
        await import('../scrapers/implementations/UrlCrawler/extractors/ContentExtractor.js');
      const extractor = new contentExtractor.ContentExtractor();
      const content = extractor.extractContent(html, trendsUrl);

      // The page content lists trends as plain text lines
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
    }

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
