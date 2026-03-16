/**
 * Intelligent Crawl Node
 *
 * Selects and crawls the most relevant URLs from search results.
 * Adds full page content to results, dramatically improving answer quality.
 *
 * Web mode: crawl top 3 URLs (fast, focused)
 * Deep mode: skip (deepResearchNode handles its own crawling)
 *
 * Uses CrawlingService.selectAndCrawlTopUrls() for the actual crawling.
 */

import { selectAndCrawlTopUrls } from '../../../../services/search/CrawlingService.js';
import { createLogger } from '../../../../utils/logger.js';

import type { EnrichedResult } from '../../WebSearchGraph/types.js';
import type { SearchGraphState } from '../types.js';

const log = createLogger('SearchGraph:IntelligentCrawl');

export async function intelligentCrawlNode(
  state: SearchGraphState
): Promise<Partial<SearchGraphState>> {
  const start = Date.now();

  // Skip crawling if no results or deep mode (deep handles its own crawling)
  if (state.searchResults.length === 0 || state.searchMode === 'deep') {
    return { crawlTimeMs: Date.now() - start };
  }

  // Only crawl web results (document results from Qdrant already have content)
  const webResults = state.searchResults.filter((r) => r.source === 'web' && r.url);

  if (webResults.length === 0) {
    log.info('[IntelligentCrawl] No web results to crawl');
    return { crawlTimeMs: Date.now() - start };
  }

  const maxUrls = 3;
  const timeout = 4000;

  log.info(`[IntelligentCrawl] Crawling top ${maxUrls} of ${webResults.length} web results`);

  try {
    const crawlable = webResults.map((r) => ({
      url: r.url!,
      title: r.title,
      content: r.content,
      relevance: r.relevance || 0.5,
    }));

    const crawled = await selectAndCrawlTopUrls(crawlable, state.searchQuery || '', {
      maxUrls,
      timeout,
    });

    // Build enriched results from crawled data
    const enrichedResults: EnrichedResult[] = crawled.map((c) => ({
      url: c.url,
      title: c.title,
      content: c.content,
      snippet: c.content.substring(0, 200),
      crawled: (c as any).crawled ?? false,
      fullContent: (c as any).fullContent,
      crawlError: (c as any).crawlError,
    }));

    const crawledCount = enrichedResults.filter((r) => r.crawled).length;
    const crawlTimeMs = Date.now() - start;

    log.info(`[IntelligentCrawl] Crawled ${crawledCount}/${maxUrls} URLs in ${crawlTimeMs}ms`);

    return {
      enrichedResults,
      crawlTimeMs,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn(`[IntelligentCrawl] Crawling failed: ${msg}`);
    return { crawlTimeMs: Date.now() - start };
  }
}
