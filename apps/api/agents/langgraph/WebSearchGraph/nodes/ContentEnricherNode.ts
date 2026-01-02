/**
 * Content Enricher Node for WebSearchGraph
 * Performs actual crawling of selected URLs
 */

import type { WebSearchState, EnrichedResult } from '../types.js';
import { urlCrawlerService } from '../../../../services/scrapers/implementations/UrlCrawler/index.js';

/**
 * Content Enricher Node: Performs actual crawling of selected URLs
 */
export async function contentEnricherNode(state: WebSearchState): Promise<Partial<WebSearchState>> {
  console.log('[WebSearchGraph] Running content enricher');

  try {
    if (!state.crawlDecisions || state.crawlDecisions.length === 0) {
      console.log('[ContentEnricher] No URLs selected for crawling');
      return {
        enrichedResults: state.webResults?.[0]?.results || [],
        crawlMetadata: {
          ...state.crawlMetadata,
          crawledCount: 0,
          nothingToCrawl: true
        }
      };
    }

    const webResults = state.webResults?.[0]?.results || [];
    const timeout = state.crawlMetadata?.timeout || 3000;

    // Perform parallel crawling of selected URLs
    console.log(`[ContentEnricher] Starting parallel crawl of ${state.crawlDecisions.length} URLs`);

    const crawlPromises = state.crawlDecisions.map(async (decision) => {
      try {
        const originalResult = webResults.find(r => r.url === decision.url);
        if (!originalResult) {
          console.warn(`[ContentEnricher] URL not found in results: ${decision.url}`);
          return null;
        }

        console.log(`[ContentEnricher] Crawling: ${originalResult.url}`);

        const crawlResult = await urlCrawlerService.crawlUrl(originalResult.url, {
          timeout
        });

        if (crawlResult.success && crawlResult.data?.content) {
          return {
            ...originalResult,
            content: crawlResult.data.content,
            crawled: true,
            fullContent: crawlResult.data.content,
            keyParagraphs: crawlResult.data.content.substring(0, 400)
          } as EnrichedResult;
        } else {
          const errorMsg = crawlResult.error || 'Unknown error';
          console.warn(`[ContentEnricher] Crawl failed for ${originalResult.url}: ${errorMsg}`);
          return {
            ...originalResult,
            crawled: false,
            crawlError: errorMsg
          } as EnrichedResult;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(`[ContentEnricher] Crawl error for ${decision.url}:`, errorMessage);
        const originalResult = webResults.find(r => r.url === decision.url);
        return originalResult ? {
          ...originalResult,
          crawled: false,
          crawlError: errorMessage
        } as EnrichedResult : null;
      }
    });

    const crawlResults = await Promise.all(crawlPromises);
    const validResults = crawlResults.filter((r): r is EnrichedResult => r !== null);
    const successfulCrawls = validResults.filter(r => r.crawled).length;

    // Merge crawled results with non-crawled results
    const enrichedResults: EnrichedResult[] = webResults.map(originalResult => {
      const crawled = validResults.find(c => c.url === originalResult.url);
      if (crawled) {
        return crawled;
      }
      return {
        ...originalResult,
        crawled: false,
        content: originalResult.snippet || originalResult.content || ''
      };
    });

    console.log(`[ContentEnricher] Crawl completed: ${successfulCrawls}/${state.crawlDecisions.length} successful`);

    return {
      enrichedResults,
      crawlMetadata: {
        ...state.crawlMetadata,
        crawledUrls: successfulCrawls,
        failedUrls: state.crawlDecisions.length - successfulCrawls,
        totalUrls: enrichedResults.length
      }
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[WebSearchGraph] Content enricher error:', errorMessage);
    return {
      enrichedResults: state.webResults?.[0]?.results || [],
      error: `Content enrichment failed: ${errorMessage}`,
      crawlMetadata: {
        ...state.crawlMetadata,
        crawledUrls: 0,
        failed: true
      }
    };
  }
}
