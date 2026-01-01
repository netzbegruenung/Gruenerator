/**
 * Crawlee Crawler
 * Crawlee integration with CheerioCrawler and PlaywrightCrawler fallback
 */

import type { CheerioAPI } from 'cheerio';
import type { CrawlerConfig, RawCrawlResult, CrawlOptions } from '../types.js';
import { MemoryStorage } from '../MemoryStorage.js';

export class CrawleeCrawler {
  private memoryStorage: MemoryStorage;

  constructor(private config: CrawlerConfig) {
    this.memoryStorage = new MemoryStorage();
  }

  /**
   * Crawls URL using Crawlee with memory-only storage
   */
  async crawlWithCrawlee(url: string, options: CrawlOptions = {}): Promise<RawCrawlResult> {
    let crawlee: any;
    try {
      crawlee = await import('crawlee');
    } catch (importError) {
      throw new Error('Crawlee not available: ' + (importError instanceof Error ? importError.message : 'Unknown error'));
    }

    const { CheerioCrawler, PlaywrightCrawler, log } = crawlee;

    // Reduce Crawlee log verbosity - only show warnings and errors
    log.setLevel(log.LEVELS.WARNING);

    // Clear memory storage before starting
    await this.memoryStorage.clear();

    const crawlOptions = {
      ...this.config,
      ...options,
      requestTimeoutSecs: Math.floor((options.timeout || this.config.timeout) / 1000),
    };

    // Try CheerioCrawler first
    try {
      return await this.runCheerioCrawler(url, crawlOptions, CheerioCrawler);
    } catch (cheerioError) {
      console.log(`[CrawleeCrawler] CheerioCrawler failed, trying PlaywrightCrawler:`, cheerioError instanceof Error ? cheerioError.message : 'Unknown error');

      // Check if error suggests JavaScript requirement
      if (this.requiresJavaScript(cheerioError)) {
        try {
          return await this.runPlaywrightCrawler(url, crawlOptions, PlaywrightCrawler);
        } catch (playwrightError) {
          console.error(`[CrawleeCrawler] Both crawlers failed for ${url}:`, playwrightError instanceof Error ? playwrightError.message : 'Unknown error');
          throw playwrightError;
        }
      } else {
        throw cheerioError;
      }
    }
  }

  /**
   * Runs CheerioCrawler with memory storage
   */
  private async runCheerioCrawler(url: string, options: any, CheerioCrawler: any): Promise<RawCrawlResult> {
    const results: RawCrawlResult[] = [];
    const queueId = `queue-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Add request to memory storage
    await this.memoryStorage.addRequest(queueId, {
      url,
      uniqueKey: `${url}-${Date.now()}`,
    });

    const crawler = new CheerioCrawler({
      maxRequestRetries: options.maxRetries,
      requestHandlerTimeoutSecs: options.requestTimeoutSecs,
      maxConcurrency: 1, // Single URL crawl
      maxRequestsPerCrawl: 1,
      persistCookiesPerSession: false,
      useSessionPool: false,

      requestHandler: async ({ request, response, $ }: { request: any; response: any; $: CheerioAPI }) => {
        try {
          // Validate response
          if (response.statusCode >= 400) {
            throw new Error(`HTTP ${response.statusCode}: ${response.statusMessage || 'Request failed'}`);
          }

          // Check content type
          const contentType = response.headers['content-type'] || '';
          if (!contentType.includes('text/html')) {
            throw new Error(`Unsupported content type: ${contentType}`);
          }

          // Check content length
          const contentLength = response.headers['content-length'];
          if (contentLength && parseInt(contentLength) > options.maxContentLength) {
            throw new Error(`Content too large: ${contentLength} bytes`);
          }

          const html = $.html();

          // Basic check for JavaScript requirement
          if (this.detectJavaScriptRequired($, html)) {
            throw new Error('JavaScript required for this page');
          }

          results.push({
            html,
            finalUrl: request.loadedUrl || request.url,
            statusCode: response.statusCode || 200,
          });
        } catch (error) {
          console.error(`[CrawleeCrawler] CheerioCrawler request handler error for ${request.url}:`, error instanceof Error ? error.message : 'Unknown error');
          throw error;
        }
      },

      errorHandler: ({ request, error }: { request: any; error: Error }) => {
        console.error(`[CrawleeCrawler] CheerioCrawler error for ${request.url}:`, error.message);
      },

      // Custom headers
      preNavigationHooks: [
        async ({ request }: { request: any }) => {
          request.headers = {
            ...request.headers,
            'User-Agent': options.userAgent,
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br',
            DNT: '1',
            Connection: 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
          };
        },
      ],
    });

    try {
      await crawler.run([url]);

      if (results.length === 0) {
        throw new Error('No content extracted from the page');
      }

      return results[0];
    } finally {
      try {
        await crawler.teardown();
      } catch (cleanupError) {
        console.warn('[CrawleeCrawler] Failed to cleanup CheerioCrawler:', cleanupError instanceof Error ? cleanupError.message : 'Unknown error');
      }
    }
  }

  /**
   * Runs PlaywrightCrawler with memory storage
   */
  private async runPlaywrightCrawler(url: string, options: any, PlaywrightCrawler: any): Promise<RawCrawlResult> {
    const results: RawCrawlResult[] = [];

    const crawler = new PlaywrightCrawler({
      maxRequestRetries: options.maxRetries,
      requestHandlerTimeoutSecs: options.requestTimeoutSecs * 2, // More time for browser
      maxConcurrency: 1,
      maxRequestsPerCrawl: 1,
      headless: options.headless !== false, // Default to headless
      persistCookiesPerSession: false,
      useSessionPool: false,

      launchContext: {
        userAgent: options.userAgent,
      },

      requestHandler: async ({ request, page }: { request: any; page: any }) => {
        try {
          // Wait for page to load
          await page.waitForLoadState('domcontentloaded');

          // Get final URL after redirects
          const finalUrl = page.url();

          // Get HTML content
          const html = await page.content();

          // Check content length
          if (html.length > options.maxContentLength) {
            throw new Error(`Content too large: ${html.length} characters`);
          }

          results.push({
            html,
            finalUrl,
            statusCode: 200, // Playwright doesn't provide direct access to status code
          });
        } catch (error) {
          console.error(`[CrawleeCrawler] PlaywrightCrawler request handler error for ${request.url}:`, error instanceof Error ? error.message : 'Unknown error');
          throw error;
        }
      },

      errorHandler: ({ request, error }: { request: any; error: Error }) => {
        console.error(`[CrawleeCrawler] PlaywrightCrawler error for ${request.url}:`, error.message);
      },
    });

    try {
      await crawler.run([url]);

      if (results.length === 0) {
        throw new Error('No content extracted from the page');
      }

      return results[0];
    } finally {
      try {
        await crawler.teardown();
      } catch (cleanupError) {
        console.warn('[CrawleeCrawler] Failed to cleanup PlaywrightCrawler:', cleanupError instanceof Error ? cleanupError.message : 'Unknown error');
      }
    }
  }

  /**
   * Determines if a page requires JavaScript
   */
  private requiresJavaScript(error: unknown): boolean {
    if (!(error instanceof Error)) return false;

    const errorMessage = error.message.toLowerCase();
    return (
      errorMessage.includes('javascript required') ||
      errorMessage.includes('javascript') ||
      errorMessage.includes('blocked') ||
      errorMessage.includes('403') ||
      errorMessage.includes('cloudflare') ||
      errorMessage.includes('bot protection') ||
      errorMessage.includes('captcha')
    );
  }

  /**
   * Basic detection for JavaScript-heavy pages
   */
  private detectJavaScriptRequired($: CheerioAPI, html: string): boolean {
    // Check for common indicators of JavaScript requirement
    const indicators = [
      // Text content indicating JS requirement
      /enable\s+javascript/i,
      /javascript\s+(is\s+)?required/i,
      /javascript\s+(is\s+)?disabled/i,
      /please\s+enable\s+javascript/i,

      // Very minimal content (potential SPA)
      html.length < 1000 && $('script').length > 5,

      // No meaningful text content
      $('body').text().trim().length < 50 && $('script').length > 0,

      // Common framework indicators with minimal content
      (html.includes('ng-app') || html.includes('data-reactroot') || html.includes('__NEXT_DATA__')) && $('body').text().trim().length < 100,
    ];

    return indicators.some((indicator) => (typeof indicator === 'boolean' ? indicator : indicator.test(html)));
  }
}
