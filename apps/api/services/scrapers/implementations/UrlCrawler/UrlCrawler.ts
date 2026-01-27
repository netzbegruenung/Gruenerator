/**
 * URL Crawler
 * General-purpose URL content extractor with multiple fallback strategies
 * Features: Crawlee (Cheerio + Playwright), native fetch, PDF support, markdown conversion
 */

import { CrawleeCrawler } from './crawlers/CrawleeCrawler.js';
import { FetchCrawler } from './crawlers/FetchCrawler.js';
import { ContentExtractor } from './extractors/ContentExtractor.js';
import { UrlValidator } from './validators/UrlValidator.js';

import type { CrawlerConfig, CrawlOptions, CrawlResult, PreviewResult } from './types.js';

export class UrlCrawler {
  private config: CrawlerConfig;
  private contentExtractor: ContentExtractor;
  private crawleeCrawler: CrawleeCrawler;
  private fetchCrawler: FetchCrawler;

  constructor() {
    this.config = {
      crawlerMode: (process.env.CRAWLER_MODE as 'crawlee' | 'fetch' | 'auto') || 'auto',
      maxConcurrency: 3,
      maxRetries: 3,
      timeout: 15000,
      maxContentLength: 10 * 1024 * 1024, // 10MB
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      usePersistentStorage: false,
    };

    this.contentExtractor = new ContentExtractor();
    this.crawleeCrawler = new CrawleeCrawler(this.config);
    this.fetchCrawler = new FetchCrawler(this.config);
  }

  /**
   * Main crawling method with automatic fallback
   * Strategy: Crawlee (Cheerio → Playwright) → Fetch
   */
  async crawlUrl(url: string, options: CrawlOptions = {}): Promise<CrawlResult> {
    console.log(`[UrlCrawler] Starting crawl for URL: ${url}`);
    const startTime = Date.now();

    try {
      // Sanitize URL first to remove common extraction artifacts
      const sanitizedUrl = UrlValidator.sanitizeUrl(url);

      // Validate URL
      const validation = await UrlValidator.validateUrl(sanitizedUrl);
      if (!validation.isValid) {
        throw new Error(validation.error);
      }

      // Use the sanitized URL for the rest of the crawl
      url = sanitizedUrl;

      console.log(`[UrlCrawler] URL validation passed, starting crawl...`);

      let html: string;
      let finalUrl: string;
      let statusCode: number;

      // Try Crawlee first (if available and preferred)
      if (this.config.crawlerMode === 'crawlee' || this.config.crawlerMode === 'auto') {
        try {
          const result = await this.crawleeCrawler.crawlWithCrawlee(url, options);
          html = result.html;
          finalUrl = result.finalUrl;
          statusCode = result.statusCode;
          console.log(`[UrlCrawler] Successfully crawled with Crawlee: ${url}`);
        } catch (crawleeError) {
          console.log(
            '[UrlCrawler] Crawlee failed for %s, falling back to fetch:',
            url,
            crawleeError instanceof Error ? crawleeError.message : 'Unknown error'
          );

          if (this.config.crawlerMode === 'crawlee') {
            // If explicitly using Crawlee, don't fallback
            throw crawleeError;
          }

          // Fallback to fetch
          const result = await this.fetchCrawler.crawlWithFetch(url, options);
          html = result.html;
          finalUrl = result.finalUrl;
          statusCode = result.statusCode;
          console.log(`[UrlCrawler] Successfully crawled with fetch fallback: ${url}`);
        }
      } else {
        // Use fetch directly
        const result = await this.fetchCrawler.crawlWithFetch(url, options);
        html = result.html;
        finalUrl = result.finalUrl;
        statusCode = result.statusCode;
        console.log(`[UrlCrawler] Successfully crawled with fetch: ${url}`);
      }

      // Extract content using Cheerio
      const contentData = this.contentExtractor.extractContent(
        html,
        finalUrl,
        options.enhancedMetadata
      );

      // Validate extracted content with better error messages
      if (!contentData.content || contentData.content.trim().length === 0) {
        throw new Error(
          'No content could be extracted from the page. The page might be empty or require JavaScript.'
        );
      }

      if (contentData.content.trim().length < 50) {
        console.warn(
          `[UrlCrawler] Low content extraction for ${url}: ${contentData.wordCount} words, source: ${contentData.contentSource}`
        );

        // Allow very short content but warn about it
        if (contentData.wordCount < 10) {
          throw new Error(
            `Insufficient content extracted: only ${contentData.wordCount} words found. The page might require JavaScript or have restricted access.`
          );
        }
      }

      console.log(`[UrlCrawler] Crawl completed successfully for ${url}`);

      return {
        success: true,
        data: {
          ...contentData,
          originalUrl: url,
          statusCode,
          processingTimeMs: Date.now() - startTime,
        },
      };
    } catch (error) {
      console.error(`[UrlCrawler] Crawl failed for ${url}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to crawl URL',
      };
    }
  }

  /**
   * Simple fetch method to get HTML content from a URL
   */
  async fetchUrl(
    url: string,
    options: CrawlOptions = {}
  ): Promise<{ html: string; finalUrl: string; statusCode: number }> {
    const sanitizedUrl = UrlValidator.sanitizeUrl(url);
    const validation = await UrlValidator.validateUrl(sanitizedUrl);
    if (!validation.isValid) {
      throw new Error(validation.error);
    }
    return await this.fetchCrawler.crawlWithFetch(sanitizedUrl, options);
  }

  /**
   * Gets a preview of content without full crawling (for validation)
   */
  async previewUrl(url: string): Promise<PreviewResult> {
    try {
      const validation = await UrlValidator.validateUrl(url);
      if (!validation.isValid) {
        throw new Error(validation.error);
      }

      // For preview, we'll just do a HEAD request to check if the URL is accessible
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      try {
        const response = await fetch(url, {
          method: 'HEAD',
          headers: {
            'User-Agent': this.config.userAgent,
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        return {
          success: true,
          data: {
            url,
            accessible: response.ok,
            statusCode: response.status,
            contentType: response.headers.get('content-type'),
            preview: `URL is ${response.ok ? 'accessible' : 'not accessible'} (${response.status})`,
          },
        };
      } catch (fetchError) {
        clearTimeout(timeoutId);
        throw fetchError;
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to preview URL',
      };
    }
  }
}

// Export singleton instance for backward compatibility
export const urlCrawler = new UrlCrawler();
