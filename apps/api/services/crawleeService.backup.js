import { CheerioCrawler, PlaywrightCrawler, Dataset } from 'crawlee';
import * as cheerio from 'cheerio';
import { URL } from 'url';

export class CrawleeService {
  constructor() {
    this.config = {
      maxConcurrency: 3,
      maxRetries: 3,
      requestTimeoutSecs: 15,
      headless: true,
      maxRequestsPerCrawl: 1,
      maxContentLength: 10 * 1024 * 1024, // 10MB
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };
  }

  /**
   * Crawls a URL using Crawlee with automatic fallback to Playwright if needed
   * @param {string} url - URL to crawl
   * @param {Object} options - Crawling options
   * @returns {Promise<{html: string, finalUrl: string, statusCode: number}>}
   */
  async crawlUrl(url, options = {}) {
    console.log(`[CrawleeService] Starting crawl for: ${url}`);

    const crawlOptions = {
      ...this.config,
      ...options
    };

    // First try with CheerioCrawler (faster, no browser overhead)
    try {
      const result = await this._crawlWithCheerio(url, crawlOptions);
      console.log(`[CrawleeService] Successfully crawled with Cheerio: ${url}`);
      return result;
    } catch (error) {
      console.log(`[CrawleeService] Cheerio crawl failed for ${url}, trying Playwright:`, error.message);

      // Check if error suggests JavaScript requirement
      if (this._shouldFallbackToPlaywright(error)) {
        try {
          const result = await this._crawlWithPlaywright(url, crawlOptions);
          console.log(`[CrawleeService] Successfully crawled with Playwright: ${url}`);
          return result;
        } catch (playwrightError) {
          console.error(`[CrawleeService] Both crawlers failed for ${url}:`, playwrightError.message);
          throw playwrightError;
        }
      } else {
        throw error;
      }
    }
  }

  /**
   * Crawls URL using CheerioCrawler (HTTP requests + Cheerio)
   * @private
   */
  async _crawlWithCheerio(url, options) {
    const results = [];
    const self = this; // Capture this reference

    // Create unique storage directory to avoid conflicts
    const storageDir = `./storage/crawl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const crawler = new CheerioCrawler({
      maxConcurrency: options.maxConcurrency,
      maxRequestRetries: options.maxRetries,
      requestHandlerTimeoutSecs: options.requestTimeoutSecs,
      maxRequestsPerCrawl: options.maxRequestsPerCrawl,
      persistCookiesPerSession: false,
      useSessionPool: false,

      async requestHandler({ request, response, $ }) {
        try {
          // Check status code first
          if (response.statusCode >= 400) {
            throw new Error(`HTTP ${response.statusCode}: ${response.statusMessage || 'Request failed'}`);
          }

          // Check content length
          const contentLength = response.headers['content-length'];
          if (contentLength && parseInt(contentLength) > options.maxContentLength) {
            throw new Error(`Content too large: ${contentLength} bytes`);
          }

          // Check content type
          const contentType = response.headers['content-type'] || '';
          if (!contentType.includes('text/html')) {
            throw new Error(`Unsupported content type: ${contentType}`);
          }

          const html = $.html();

          // Basic check for JavaScript requirement
          if (self._detectJavaScriptRequired($, html)) {
            throw new Error('JavaScript required for this page');
          }

          results.push({
            html,
            finalUrl: request.loadedUrl || request.url,
            statusCode: response.statusCode || 200
          });
        } catch (error) {
          console.error(`[CrawleeService] Request handler error for ${request.url}:`, error.message);
          throw error;
        }
      },

      failedRequestHandler({ request, error }) {
        console.error(`[CrawleeService] Cheerio request failed for ${request.url}:`, error.message);
        // Don't rethrow here - let crawler handle it
        return;
      },

      // Custom headers
      preNavigationHooks: [
        async ({ request }) => {
          request.headers = {
            ...request.headers,
            'User-Agent': options.userAgent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
          };
        }
      ]
    });

    try {
      // Add a unique query parameter to prevent URL deduplication
      const urlObj = new URL(url);
      urlObj.searchParams.set('_crawlee_unique', Date.now().toString());
      const uniqueUrl = urlObj.toString();

      await crawler.run([uniqueUrl]);

      if (results.length === 0) {
        throw new Error('No content extracted from the page');
      }

      const result = results[0];
      // Return the original URL, not the modified one
      return {
        ...result,
        finalUrl: result.finalUrl.replace(/[?&]_crawlee_unique=\d+/, '')
      };
    } finally {
      // Cleanup crawler
      try {
        await crawler.teardown();
      } catch (cleanupError) {
        console.warn('[CrawleeService] Failed to cleanup crawler:', cleanupError.message);
      }
    }
  }

  /**
   * Crawls URL using PlaywrightCrawler (headless browser)
   * @private
   */
  async _crawlWithPlaywright(url, options) {
    const results = [];
    const self = this; // Capture this reference

    const crawler = new PlaywrightCrawler({
      maxConcurrency: Math.max(1, Math.floor(options.maxConcurrency / 2)), // Less concurrency for browser
      maxRequestRetries: options.maxRetries,
      requestHandlerTimeoutSecs: options.requestTimeoutSecs * 2, // More time for browser
      maxRequestsPerCrawl: options.maxRequestsPerCrawl,
      headless: options.headless,
      persistCookiesPerSession: false,
      useSessionPool: false,

      launchContext: {
        userAgent: options.userAgent
      },

      async requestHandler({ request, page }) {
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
          statusCode: 200 // Playwright doesn't provide direct access to status code
        });
      },

      failedRequestHandler({ request, error }) {
        console.error(`[CrawleeService] Playwright request failed for ${request.url}:`, error.message);
        // Don't rethrow here - let crawler handle it
        return;
      }
    });

    try {
      // Add a unique query parameter to prevent URL deduplication
      const urlObj = new URL(url);
      urlObj.searchParams.set('_crawlee_unique', Date.now().toString());
      const uniqueUrl = urlObj.toString();

      await crawler.run([uniqueUrl]);

      if (results.length === 0) {
        throw new Error('No content extracted from the page');
      }

      const result = results[0];
      // Return the original URL, not the modified one
      return {
        ...result,
        finalUrl: result.finalUrl.replace(/[?&]_crawlee_unique=\d+/, '')
      };
    } finally {
      // Cleanup crawler
      try {
        await crawler.teardown();
      } catch (cleanupError) {
        console.warn('[CrawleeService] Failed to cleanup Playwright crawler:', cleanupError.message);
      }
    }
  }

  /**
   * Determines if we should fallback to Playwright based on error
   * @private
   */
  _shouldFallbackToPlaywright(error) {
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
   * @private
   */
  _detectJavaScriptRequired($, html) {
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
      (html.includes('ng-app') || html.includes('data-reactroot') || html.includes('__NEXT_DATA__')) &&
      $('body').text().trim().length < 100
    ];

    return indicators.some(indicator =>
      typeof indicator === 'boolean' ? indicator : indicator.test(html)
    );
  }

  /**
   * Validates URL format and security
   * @param {string} url - URL to validate
   * @returns {Promise<{isValid: boolean, error?: string}>}
   */
  async validateUrl(url) {
    try {
      const urlObj = new URL(url);

      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        return {
          isValid: false,
          error: 'Only HTTP and HTTPS protocols are supported'
        };
      }

      // Check for localhost or private IP addresses in production
      if (process.env.NODE_ENV === 'production') {
        const hostname = urlObj.hostname.toLowerCase();
        if (hostname === 'localhost' ||
            hostname.startsWith('127.') ||
            hostname.startsWith('10.') ||
            hostname.startsWith('192.168.') ||
            hostname.startsWith('172.')) {
          return {
            isValid: false,
            error: 'Local and private network URLs are not allowed'
          };
        }
      }

      return { isValid: true };
    } catch (error) {
      return {
        isValid: false,
        error: 'Invalid URL format'
      };
    }
  }

  /**
   * Quick preview of URL accessibility (HEAD request)
   * @param {string} url - URL to preview
   * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
   */
  async previewUrl(url) {
    try {
      const validation = await this.validateUrl(url);
      if (!validation.isValid) {
        throw new Error(validation.error);
      }

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
            preview: `URL is ${response.ok ? 'accessible' : 'not accessible'} (${response.status})`
          }
        };

      } catch (fetchError) {
        clearTimeout(timeoutId);
        throw fetchError;
      }

    } catch (error) {
      return {
        success: false,
        error: error.message || 'Failed to preview URL'
      };
    }
  }
}

// Export singleton instance
export const crawleeService = new CrawleeService();