/**
 * Crawling Service
 *
 * Shared service for selective URL crawling, used by both ChatGraph and WebSearchGraph.
 * Extracts the crawl + merge logic from ContentEnricherNode into a reusable service.
 *
 * For ChatGraph: crawls top N results by relevance (no AI decision needed).
 * For WebSearchGraph: the IntelligentCrawlerNode still handles AI-powered URL selection,
 * but ContentEnricherNode can delegate actual crawling to this service.
 */

import { urlCrawlerService } from '../scrapers/implementations/UrlCrawler/index.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('CrawlingService');

export interface CrawlableResult {
  url?: string;
  title?: string;
  content?: string;
  snippet?: string;
  relevance?: number;
  [key: string]: any;
}

export interface CrawledResult extends CrawlableResult {
  fullContent?: string;
  crawled: boolean;
  crawlError?: string;
}

export interface CrawlOptions {
  maxUrls: number;
  timeout: number;
}

/**
 * Select the top URLs by relevance and crawl them for full content.
 * Returns the merged results with crawled content replacing snippets where successful.
 */
export async function selectAndCrawlTopUrls<T extends CrawlableResult>(
  results: T[],
  query: string,
  options: CrawlOptions = { maxUrls: 2, timeout: 3000 }
): Promise<(T & CrawledResult)[]> {
  const { maxUrls, timeout } = options;

  // Select top URLs by relevance that have valid URLs
  const crawlCandidates = results
    .filter((r) => r.url && r.url.startsWith('http'))
    .sort((a, b) => (b.relevance || 0) - (a.relevance || 0))
    .slice(0, maxUrls);

  if (crawlCandidates.length === 0) {
    log.info('[Crawl] No crawlable URLs found in results');
    return results.map((r) => ({ ...r, crawled: false }));
  }

  log.info(`[Crawl] Crawling top ${crawlCandidates.length} URLs for query: "${query.slice(0, 50)}..."`);

  const crawlUrlSet = new Set(crawlCandidates.map((c) => c.url));

  // Crawl selected URLs in parallel
  const crawlPromises = crawlCandidates.map(async (candidate) => {
    try {
      const crawlResult = await urlCrawlerService.crawlUrl(candidate.url!, { timeout });

      if (crawlResult.success && crawlResult.data?.content) {
        log.info(`[Crawl] Success: ${candidate.url} (${crawlResult.data.content.length} chars)`);
        return {
          url: candidate.url!,
          fullContent: crawlResult.data.content,
          crawled: true,
        };
      } else {
        log.warn(`[Crawl] Failed: ${candidate.url}: ${crawlResult.error || 'no content'}`);
        return {
          url: candidate.url!,
          crawled: false,
          crawlError: crawlResult.error || 'No content extracted',
        };
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log.warn(`[Crawl] Error: ${candidate.url}: ${msg}`);
      return {
        url: candidate.url!,
        crawled: false,
        crawlError: msg,
      };
    }
  });

  const crawlResults = await Promise.all(crawlPromises);
  const crawlMap = new Map(crawlResults.map((r) => [r.url, r]));

  const successCount = crawlResults.filter((r) => r.crawled).length;
  log.info(`[Crawl] Complete: ${successCount}/${crawlCandidates.length} successful`);

  // Merge crawled content back into results
  return results.map((result) => {
    if (result.url && crawlUrlSet.has(result.url)) {
      const crawled = crawlMap.get(result.url);
      if (crawled?.crawled && crawled.fullContent) {
        return {
          ...result,
          fullContent: crawled.fullContent,
          crawled: true,
        };
      }
      return {
        ...result,
        crawled: false,
        crawlError: crawled?.crawlError,
      };
    }
    return { ...result, crawled: false };
  });
}
