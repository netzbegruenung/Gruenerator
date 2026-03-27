/**
 * Table Media Berlin Scraper
 * Scrapes table.media/berlin listing page for article links,
 * then crawls each article for full text content.
 * Runs once per daily refresh — articles update in the evening.
 */

import { createLogger } from '../../utils/logger.js';
import { parallelLimit } from '../../utils/parallelLimit.js';
import { urlCrawler } from '../scrapers/implementations/UrlCrawler/index.js';

import type { CollectedMonitorItem } from './MonitorCollectorService.js';

const log = createLogger('TableMediaScraper');

const BASE_URL = 'https://table.media';
const LISTING_URL = `${BASE_URL}/berlin`;
const CRAWL_CONCURRENCY = 2;
const ARTICLE_TIMEOUT = 15000;

function extractArticleUrls(html: string): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();

  // Match href="/berlin/..." patterns (talk-of-the-town, news, interview sections)
  const pattern = /href="(\/berlin\/(?:talk-of-the-town|news|interview|analyse|dokument)\/[^"]+)"/g;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    const path = match[1];
    if (!seen.has(path)) {
      seen.add(path);
      urls.push(`${BASE_URL}${path}`);
    }
  }

  return urls;
}

function extractTitle(html: string): string {
  // Try og:title first
  const ogMatch = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/);
  if (ogMatch) return ogMatch[1];

  // Fallback to <title>
  const titleMatch = html.match(/<title>([^<]+)<\/title>/);
  if (titleMatch) return titleMatch[1].replace(/ - Table\.Media.*$/, '').trim();

  return '';
}

function extractDate(html: string): string | null {
  // Look for datePublished in JSON-LD
  const dateMatch = html.match(/"datePublished"\s*:\s*"([^"]+)"/);
  if (dateMatch) return dateMatch[1];

  // Fallback: look for date patterns in content
  const germanDate = html.match(/(\d{2}\.\d{2}\.\d{4})/);
  if (germanDate) {
    const [day, month, year] = germanDate[1].split('.');
    return `${year}-${month}-${day}`;
  }

  return null;
}

export async function scrapeTableMedia(): Promise<CollectedMonitorItem[]> {
  log.info('Scraping Table.Media Berlin...');

  try {
    // Step 1: Fetch listing page to get article URLs
    const listingResult = await urlCrawler.fetchUrl(LISTING_URL);
    const articleUrls = extractArticleUrls(listingResult.html);

    if (articleUrls.length === 0) {
      log.warn('No article URLs found on Table.Media listing page');
      return [];
    }

    log.info(`Found ${articleUrls.length} article URLs`);

    // Step 2: Crawl each article for full content
    const crawlTasks = articleUrls.map((url) => async (): Promise<CollectedMonitorItem | null> => {
      try {
        const result = await urlCrawler.crawlUrl(url, {
          timeout: ARTICLE_TIMEOUT,
          maxRetries: 1,
        });

        if (!result.success || !result.data?.content) {
          log.warn(`Failed to crawl ${url}: ${result.error || 'no content'}`);
          return null;
        }

        const title = result.data.title || extractTitle(result.data.content);
        const content = result.data.content;

        return {
          url,
          title,
          excerpt: content.slice(0, 2000),
          source: 'Table.Media Berlin',
          publishedAt: result.data.publicationDate || extractDate(result.data.content) || null,
          locale: 'de' as const,
        };
      } catch (error) {
        log.warn(`Error crawling ${url}: ${error}`);
        return null;
      }
    });

    const results = await parallelLimit(crawlTasks, CRAWL_CONCURRENCY);
    const articles = results.filter((r): r is CollectedMonitorItem => r !== null);

    log.info(`Table.Media: ${articles.length} articles scraped with full text`);
    return articles;
  } catch (error) {
    log.error(`Table.Media scraping failed: ${error}`);
    return [];
  }
}
