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

import { createLogger } from '../../utils/logger.js';
import { urlCrawlerService } from '../scrapers/implementations/UrlCrawler/index.js';

import { distillPassages } from './PassageDistiller.js';

import type { DistilledChunk, DistillMode } from './PassageDistiller.js';
import type { AIWorkerPool } from '../../workers/types.js';

const log = createLogger('CrawlingService');

export interface CrawlableResult {
  url?: string;
  title?: string;
  content?: string;
  snippet?: string;
  relevance?: number;
  [key: string]: unknown;
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

  log.info(
    `[Crawl] Crawling top ${crawlCandidates.length} URLs for query: "${query.slice(0, 50)}..."`
  );

  const crawlUrlSet = new Set(crawlCandidates.map((c) => c.url));

  // Crawl selected URLs in parallel
  const crawlPromises = crawlCandidates.map(async (candidate) => {
    try {
      const crawlResult = await urlCrawlerService.crawlUrl(candidate.url!, {
        timeout,
        maxRetries: 1,
      });

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
  const mergedResults: (T & CrawledResult)[] = results.map((result) => {
    if (result.url && crawlUrlSet.has(result.url)) {
      const crawled = crawlMap.get(result.url);
      if (crawled?.crawled && crawled.fullContent) {
        const successResult: T & CrawledResult = {
          ...result,
          fullContent: crawled.fullContent,
          crawled: true,
        } as T & CrawledResult;
        return successResult;
      }
      const failedResult: T & CrawledResult = {
        ...result,
        crawled: false,
        ...(crawled?.crawlError ? { crawlError: crawled.crawlError } : {}),
      };
      return failedResult;
    }
    const uncrawledResult: T & CrawledResult = { ...result, crawled: false } as T & CrawledResult;
    return uncrawledResult;
  });
  return mergedResults;
}

export interface DistilledCrawlResult extends CrawledResult {
  distilled?: boolean;
  distilledChunks?: DistilledChunk[];
  sourceChars?: number;
}

export interface CrawlAndDistillOptions extends CrawlOptions {
  mode: DistillMode;
  targetChars: number;
  aiWorkerPool?: AIWorkerPool | null;
}

/**
 * Crawl, then keep the part of the page that answers the question.
 *
 * Added ALONGSIDE `selectAndCrawlTopUrls` rather than replacing it:
 * WebSearchGraph's ContentEnricherNode, SearchGraph's intelligentCrawlNode and
 * the board agent's scrapeSource all depend on that function's exact contract.
 *
 * Unlike the raw crawler this sets `content` — the crawler only ever adds
 * `fullContent` and leaves the merge to its caller, which is how one of the two
 * ChatGraph crawl sites ended up never setting `crawled` at all.
 */
export async function crawlAndDistill<T extends CrawlableResult>(
  results: T[],
  query: string,
  options: CrawlAndDistillOptions
): Promise<(T & DistilledCrawlResult)[]> {
  const crawled = await selectAndCrawlTopUrls(results, query, {
    maxUrls: options.maxUrls,
    timeout: options.timeout,
  });

  const distilled = await Promise.all(
    crawled.map(async (result) => {
      const raw = result.fullContent;
      if (!result.crawled || !raw) return result as T & DistilledCrawlResult;

      const out = await distillPassages({
        text: raw,
        query,
        mode: options.mode,
        targetChars: options.targetChars,
        ...(result.url ? { url: result.url } : {}),
        ...(options.aiWorkerPool ? { aiWorkerPool: options.aiWorkerPool } : {}),
      });

      return {
        ...result,
        content: out.digest || result.content || '',
        crawled: true,
        distilled: out.method !== 'disabled' && out.method !== 'passthrough',
        distilledChunks: out.chunks,
        sourceChars: out.sourceChars,
      } as T & DistilledCrawlResult;
    })
  );

  const kept = distilled.filter((r) => r.distilled);
  if (kept.length > 0) {
    const from = kept.reduce((sum, r) => sum + (r.sourceChars ?? 0), 0);
    const to = kept.reduce((sum, r) => sum + (r.content?.length ?? 0), 0);
    log.info(`[Crawl] Distilled ${kept.length}/${crawled.length} pages: ${from}→${to} chars`);
  }
  return distilled;
}
