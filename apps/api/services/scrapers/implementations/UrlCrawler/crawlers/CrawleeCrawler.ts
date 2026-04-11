/**
 * Crawlee Crawler
 * Crawlee integration with CheerioCrawler and PlaywrightCrawler fallback
 */

import {
  type CheerioCrawler as CheerioCrawlerClass,
  type CheerioCrawlingContext,
  type PlaywrightCrawler as PlaywrightCrawlerClass,
  type PlaywrightCrawlingContext,
  type Configuration as CrawleeConfiguration,
  type Log,
} from 'crawlee';

import { type CrawlerConfig, type RawCrawlResult, type CrawlOptions } from '../types.js';

interface CrawleeModule {
  CheerioCrawler: typeof CheerioCrawlerClass;
  PlaywrightCrawler: typeof PlaywrightCrawlerClass;
  Configuration: typeof CrawleeConfiguration;
  log: Log;
}

interface CrawlerRunOptions {
  crawlerMode: string;
  maxConcurrency: number;
  maxRetries: number;
  timeout: number;
  maxContentLength: number;
  userAgent: string;
  requestTimeoutSecs: number;
  enhancedMetadata?: boolean | undefined;
  headless?: boolean | undefined;
  metadataOnly?: boolean | undefined;
}

export class CrawleeCrawler {
  constructor(private config: CrawlerConfig) {}

  /**
   * Crawls URL using Crawlee with memory-only storage
   */
  async crawlWithCrawlee(url: string, options: CrawlOptions = {}): Promise<RawCrawlResult> {
    let crawlee: CrawleeModule;
    try {
      crawlee = await import('crawlee');
    } catch (importError) {
      throw new Error(
        'Crawlee not available: ' +
          (importError instanceof Error ? importError.message : 'Unknown error')
      );
    }

    const { CheerioCrawler, PlaywrightCrawler, Configuration, log } = crawlee;

    // Reduce Crawlee log verbosity - only show warnings and errors
    log.setLevel(log.LEVELS.WARNING);

    // Per-crawl in-memory configuration to avoid shared disk storage races
    const crawlerConfig = new Configuration({
      storageClientOptions: {
        persistStorage: false,
      },
    });

    const crawlOptions: CrawlerRunOptions = {
      ...this.config,
      ...options,
      requestTimeoutSecs: Math.floor((options.timeout || this.config.timeout) / 1000),
    } as CrawlerRunOptions;

    // Try CheerioCrawler first
    try {
      return await this.runCheerioCrawler(url, crawlOptions, CheerioCrawler, crawlerConfig);
    } catch (cheerioError) {
      console.log(
        `[CrawleeCrawler] CheerioCrawler failed, trying PlaywrightCrawler:`,
        cheerioError instanceof Error ? cheerioError.message : 'Unknown error'
      );

      // Check if error suggests JavaScript requirement
      if (this.requiresJavaScript(cheerioError)) {
        try {
          return await this.runPlaywrightCrawler(
            url,
            crawlOptions,
            PlaywrightCrawler,
            crawlerConfig
          );
        } catch (playwrightError) {
          console.error(
            '[CrawleeCrawler] Both crawlers failed for %s:',
            url,
            playwrightError instanceof Error ? playwrightError.message : 'Unknown error'
          );
          throw playwrightError;
        }
      } else {
        throw cheerioError;
      }
    }
  }

  /**
   * Runs CheerioCrawler with in-memory storage
   */
  private async runCheerioCrawler(
    url: string,
    options: CrawlerRunOptions,
    CheerioCrawler: typeof CheerioCrawlerClass,
    crawlerConfig: CrawleeConfiguration
  ): Promise<RawCrawlResult> {
    const results: RawCrawlResult[] = [];

    const crawler = new CheerioCrawler(
      {
        ...(options.maxRetries != null && { maxRequestRetries: options.maxRetries }),
        requestHandlerTimeoutSecs: options.requestTimeoutSecs,
        maxConcurrency: 1, // Single URL crawl
        maxRequestsPerCrawl: 1,
        persistCookiesPerSession: false,
        useSessionPool: false,

        requestHandler: async ({ request, response, $ }: CheerioCrawlingContext) => {
          try {
            // Validate response
            if (response.statusCode && response.statusCode >= 400) {
              throw new Error(
                `HTTP ${response.statusCode}: ${response.statusMessage || 'Request failed'}`
              );
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
            console.error(
              `[CrawleeCrawler] CheerioCrawler request handler error for ${request.url}:`,
              error instanceof Error ? error.message : 'Unknown error'
            );
            throw error;
          }
        },

        errorHandler: (ctx: CheerioCrawlingContext, error: Error) => {
          console.error(
            `[CrawleeCrawler] CheerioCrawler error for ${ctx.request.url}:`,
            error.message
          );
        },

        // Custom headers
        preNavigationHooks: [
          async ({ request }: CheerioCrawlingContext) => {
            request.headers = {
              ...request.headers,
              ...(options.userAgent != null && { 'User-Agent': options.userAgent }),
              Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.5',
              'Accept-Encoding': 'gzip, deflate, br',
              DNT: '1',
              Connection: 'keep-alive',
              'Upgrade-Insecure-Requests': '1',
            };
          },
        ],
      },
      crawlerConfig
    );

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
        console.warn(
          '[CrawleeCrawler] Failed to cleanup CheerioCrawler:',
          cleanupError instanceof Error ? cleanupError.message : 'Unknown error'
        );
      }
    }
  }

  /**
   * Runs PlaywrightCrawler with in-memory storage
   */
  private async runPlaywrightCrawler(
    url: string,
    options: CrawlerRunOptions,
    PlaywrightCrawler: typeof PlaywrightCrawlerClass,
    crawlerConfig: CrawleeConfiguration
  ): Promise<RawCrawlResult> {
    const results: RawCrawlResult[] = [];

    const crawler = new PlaywrightCrawler(
      {
        ...(options.maxRetries != null && { maxRequestRetries: options.maxRetries }),
        requestHandlerTimeoutSecs: options.requestTimeoutSecs * 2, // More time for browser
        maxConcurrency: 1,
        maxRequestsPerCrawl: 1,
        headless: options.headless !== false, // Default to headless
        persistCookiesPerSession: false,
        useSessionPool: false,

        ...(options.userAgent != null && {
          launchContext: {
            userAgent: options.userAgent,
          },
        }),

        requestHandler: async ({ request, page }: PlaywrightCrawlingContext) => {
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
            console.error(
              `[CrawleeCrawler] PlaywrightCrawler request handler error for ${request.url}:`,
              error instanceof Error ? error.message : 'Unknown error'
            );
            throw error;
          }
        },

        errorHandler: (ctx: PlaywrightCrawlingContext, error: Error) => {
          console.error(
            `[CrawleeCrawler] PlaywrightCrawler error for ${ctx.request.url}:`,
            error.message
          );
        },
      },
      crawlerConfig
    );

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
        console.warn(
          '[CrawleeCrawler] Failed to cleanup PlaywrightCrawler:',
          cleanupError instanceof Error ? cleanupError.message : 'Unknown error'
        );
      }
    }
  }

  /**
   * Determines if a page requires JavaScript
   */
  private requiresJavaScript(error: unknown): boolean {
    if (!(error instanceof Error)) return false;

    const msg = error.message.toLowerCase();
    return (
      msg.includes('javascript required') ||
      msg.includes('javascript is required') ||
      msg.includes('javascript is disabled') ||
      msg.includes('please enable javascript') ||
      msg.includes('cloudflare') ||
      msg.includes('bot protection') ||
      msg.includes('captcha')
    );
  }

  /**
   * Basic detection for JavaScript-heavy pages
   */
  private detectJavaScriptRequired($: CheerioCrawlingContext['$'], html: string): boolean {
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
      (html.includes('ng-app') ||
        html.includes('data-reactroot') ||
        html.includes('__NEXT_DATA__')) &&
        $('body').text().trim().length < 100,
    ];

    return indicators.some((indicator) =>
      typeof indicator === 'boolean' ? indicator : indicator.test(html)
    );
  }
}
