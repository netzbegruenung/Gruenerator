/**
 * Twitter/X Trends Scraper for Germany
 * Scrapes trends24.in/germany/ for top trending topics.
 * Free, no API key needed.
 */

import { createLogger } from '../../utils/logger.js';
import { urlCrawler } from '../scrapers/implementations/UrlCrawler/index.js';

const log = createLogger('TwitterTrends');

const TRENDS_URL = 'https://trends24.in/germany/';

export interface TwitterTrend {
  rank: number;
  name: string;
  url: string;
}

export async function scrapeTwitterTrends(): Promise<TwitterTrend[]> {
  log.info('Scraping Twitter trends for Germany...');

  try {
    const result = await urlCrawler.fetchUrl(TRENDS_URL, { timeout: 15000 });
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
      const content = extractor.extractContent(html, TRENDS_URL);

      // The page content lists trends as plain text lines
      const lines = content.content
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length >= 2 && l.length <= 50);
      for (const line of lines) {
        if (seen.has(line.toLowerCase())) continue;
        // Skip navigation/boilerplate
        if (/^(home|about|privacy|contact|trends|germany|worldwide)/i.test(line)) continue;
        seen.add(line.toLowerCase());

        trends.push({
          rank: trends.length + 1,
          name: line,
          url: `https://x.com/search?q=${encodeURIComponent(line)}`,
        });

        if (trends.length >= 50) break;
      }
    }

    log.info(`Scraped ${trends.length} Twitter trends for Germany`);
    return trends.slice(0, 50);
  } catch (error) {
    log.error(`Twitter trends scrape failed: ${error}`);
    return [];
  }
}
