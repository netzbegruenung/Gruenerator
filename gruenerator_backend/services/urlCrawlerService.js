import * as cheerio from 'cheerio';
import { URL } from 'url';
import TurndownService from 'turndown';

/**
 * In-memory storage adapter for Crawlee to avoid persistence issues
 */
class MemoryStorage {
  constructor() {
    this.data = new Map();
    this.queues = new Map();
  }

  async getValue(key) {
    return this.data.get(key) || null;
  }

  async setValue(key, value) {
    this.data.set(key, value);
  }

  async deleteValue(key) {
    this.data.delete(key);
  }

  async clear() {
    this.data.clear();
    this.queues.clear();
  }

  // Queue-specific methods
  async addRequest(queueId, request) {
    if (!this.queues.has(queueId)) {
      this.queues.set(queueId, []);
    }
    this.queues.get(queueId).push(request);
  }

  async getRequest(queueId) {
    const queue = this.queues.get(queueId);
    return queue && queue.length > 0 ? queue.shift() : null;
  }

  async isEmpty(queueId) {
    const queue = this.queues.get(queueId);
    return !queue || queue.length === 0;
  }
}

class URLCrawlerService {
  constructor() {
    this.config = {
      // Crawler preference: 'crawlee', 'fetch', 'auto'
      crawlerMode: process.env.CRAWLER_MODE || 'auto',
      maxConcurrency: 3,
      maxRetries: 3,
      timeout: 15000,
      maxContentLength: 10 * 1024 * 1024, // 10MB
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      usePersistentStorage: false
    };

    // Initialize Turndown service for HTML to Markdown conversion
    this.turndownService = new TurndownService({
      headingStyle: 'atx',
      hr: '---',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced',
      emDelimiter: '*',
      strongDelimiter: '**',
    });

    // Memory storage instance
    this.memoryStorage = new MemoryStorage();
  }

  /**
   * Validates if a URL is valid and accessible
   * @param {string} url - The URL to validate
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
   * Main crawling method with automatic fallback
   * @param {string} url - The URL to crawl
   * @param {Object} options - Crawling options
   * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
   */
  async crawlUrl(url, options = {}) {
    console.log(`[URLCrawlerService] Starting crawl for URL: ${url}`);
    const startTime = Date.now();

    try {
      // Validate URL first
      const validation = await this.validateUrl(url);
      if (!validation.isValid) {
        throw new Error(validation.error);
      }

      console.log(`[URLCrawlerService] URL validation passed, starting crawl...`);

      let html, finalUrl, statusCode;

      // Try Crawlee first (if available and preferred)
      if (this.config.crawlerMode === 'crawlee' || this.config.crawlerMode === 'auto') {
        try {
          const result = await this._crawlWithCrawlee(url, options);
          html = result.html;
          finalUrl = result.finalUrl;
          statusCode = result.statusCode;
          console.log(`[URLCrawlerService] Successfully crawled with Crawlee: ${url}`);
        } catch (crawleeError) {
          console.log(`[URLCrawlerService] Crawlee failed for ${url}, falling back to fetch:`, crawleeError.message);

          if (this.config.crawlerMode === 'crawlee') {
            // If explicitly using Crawlee, don't fallback
            throw crawleeError;
          }

          // Fallback to fetch
          const result = await this._crawlWithFetch(url, options);
          html = result.html;
          finalUrl = result.finalUrl;
          statusCode = result.statusCode;
          console.log(`[URLCrawlerService] Successfully crawled with fetch fallback: ${url}`);
        }
      } else {
        // Use fetch directly
        const result = await this._crawlWithFetch(url, options);
        html = result.html;
        finalUrl = result.finalUrl;
        statusCode = result.statusCode;
        console.log(`[URLCrawlerService] Successfully crawled with fetch: ${url}`);
      }

      // Extract content using Cheerio
      const contentData = this.extractContent(html, finalUrl, options.enhancedMetadata);

      // Validate extracted content
      if (!contentData.content || contentData.content.trim().length < 50) {
        throw new Error('Insufficient content extracted from the page. The page might be empty or require JavaScript.');
      }

      console.log(`[URLCrawlerService] Crawl completed successfully for ${url}`);

      return {
        success: true,
        data: {
          ...contentData,
          originalUrl: url,
          statusCode,
          processingTimeMs: Date.now() - startTime
        }
      };

    } catch (error) {
      console.error(`[URLCrawlerService] Crawl failed for ${url}:`, error);
      return {
        success: false,
        error: error.message || 'Failed to crawl URL'
      };
    }
  }

  /**
   * Crawls URL using Crawlee with memory-only storage
   * @private
   */
  async _crawlWithCrawlee(url, options = {}) {
    let crawlee;
    try {
      crawlee = await import('crawlee');
    } catch (importError) {
      throw new Error('Crawlee not available: ' + importError.message);
    }

    const { CheerioCrawler, PlaywrightCrawler, Configuration } = crawlee;

    // Clear memory storage before starting
    await this.memoryStorage.clear();

    const crawlOptions = {
      ...this.config,
      ...options,
      requestTimeoutSecs: Math.floor((options.timeout || this.config.timeout) / 1000),
    };

    // Try CheerioCrawler first
    try {
      return await this._runCheerioCrawler(url, crawlOptions, CheerioCrawler);
    } catch (cheerioError) {
      console.log(`[URLCrawlerService] CheerioCrawler failed, trying PlaywrightCrawler:`, cheerioError.message);

      // Check if error suggests JavaScript requirement
      if (this._requiresJavaScript(cheerioError)) {
        try {
          return await this._runPlaywrightCrawler(url, crawlOptions, PlaywrightCrawler);
        } catch (playwrightError) {
          console.error(`[URLCrawlerService] Both crawlers failed for ${url}:`, playwrightError.message);
          throw playwrightError;
        }
      } else {
        throw cheerioError;
      }
    }
  }

  /**
   * Runs CheerioCrawler with memory storage
   * @private
   */
  async _runCheerioCrawler(url, options, CheerioCrawler) {
    const results = [];
    const queueId = `queue-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Add request to memory storage
    await this.memoryStorage.addRequest(queueId, {
      url,
      uniqueKey: `${url}-${Date.now()}`
    });

    const crawler = new CheerioCrawler({
      maxRequestRetries: options.maxRetries,
      requestHandlerTimeoutSecs: options.requestTimeoutSecs,
      maxConcurrency: 1, // Single URL crawl
      maxRequestsPerCrawl: 1,
      persistCookiesPerSession: false,
      useSessionPool: false,

      requestHandler: async ({ request, response, $ }) => {
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
          if (this._detectJavaScriptRequired($, html)) {
            throw new Error('JavaScript required for this page');
          }

          results.push({
            html,
            finalUrl: request.loadedUrl || request.url,
            statusCode: response.statusCode || 200
          });
        } catch (error) {
          console.error(`[URLCrawlerService] CheerioCrawler request handler error for ${request.url}:`, error.message);
          throw error;
        }
      },

      errorHandler: ({ request, error }) => {
        console.error(`[URLCrawlerService] CheerioCrawler error for ${request.url}:`, error.message);
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
      await crawler.run([url]);

      if (results.length === 0) {
        throw new Error('No content extracted from the page');
      }

      return results[0];
    } finally {
      try {
        await crawler.teardown();
      } catch (cleanupError) {
        console.warn('[URLCrawlerService] Failed to cleanup CheerioCrawler:', cleanupError.message);
      }
    }
  }

  /**
   * Runs PlaywrightCrawler with memory storage
   * @private
   */
  async _runPlaywrightCrawler(url, options, PlaywrightCrawler) {
    const results = [];

    const crawler = new PlaywrightCrawler({
      maxRequestRetries: options.maxRetries,
      requestHandlerTimeoutSecs: options.requestTimeoutSecs * 2, // More time for browser
      maxConcurrency: 1,
      maxRequestsPerCrawl: 1,
      headless: options.headless !== false, // Default to headless
      persistCookiesPerSession: false,
      useSessionPool: false,

      launchContext: {
        userAgent: options.userAgent
      },

      requestHandler: async ({ request, page }) => {
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
            statusCode: 200 // Playwright doesn't provide direct access to status code
          });
        } catch (error) {
          console.error(`[URLCrawlerService] PlaywrightCrawler request handler error for ${request.url}:`, error.message);
          throw error;
        }
      },

      errorHandler: ({ request, error }) => {
        console.error(`[URLCrawlerService] PlaywrightCrawler error for ${request.url}:`, error.message);
      }
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
        console.warn('[URLCrawlerService] Failed to cleanup PlaywrightCrawler:', cleanupError.message);
      }
    }
  }

  /**
   * Fallback crawling using native fetch
   * @private
   */
  async _crawlWithFetch(url, options = {}) {
    const fetchOptions = {
      ...this.config,
      ...options
    };

    console.log(`[URLCrawlerService] Fetching URL with fetch: ${url}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), fetchOptions.timeout);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': fetchOptions.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
        },
        signal: controller.signal,
        redirect: 'follow',
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Check content type
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('text/html')) {
        throw new Error(`Unsupported content type: ${contentType}`);
      }

      // Check content length
      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength) > fetchOptions.maxContentLength) {
        throw new Error(`Content too large: ${contentLength} bytes`);
      }

      const html = await response.text();

      return {
        html,
        finalUrl: response.url,
        statusCode: response.status
      };

    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${fetchOptions.timeout}ms`);
      }

      throw error;
    }
  }

  /**
   * Extracts clean text content from HTML using Cheerio
   * @param {string} html - The HTML content
   * @param {string} url - The source URL for context
   * @param {boolean} enhancedMetadata - Whether to extract enhanced metadata
   * @returns {Object} Extracted content data
   */
  extractContent(html, url, enhancedMetadata = false) {
    console.log(`[URLCrawlerService] Extracting content from HTML (${html.length} characters), enhanced: ${enhancedMetadata}`);

    const $ = cheerio.load(html);

    // Remove unwanted elements
    $('script, style, nav, header, footer, .navigation, .sidebar, .ads, .advertisement, noscript, iframe').remove();

    // Extract metadata
    const title = $('title').text().trim() || $('h1').first().text().trim() || 'Untitled';
    const metaDescription = $('meta[name="description"]').attr('content') ||
                          $('meta[property="og:description"]').attr('content') || '';
    const canonical = $('link[rel="canonical"]').attr('href') || url;

    // Extract enhanced metadata if requested
    let enhancedData = {};
    if (enhancedMetadata) {
      enhancedData = this.extractEnhancedMetadata($, url);
    }

    // Content extraction selectors in order of preference
    const contentSelectors = [
      'article',
      'main',
      '[role="main"]',
      '.content',
      '.post-content',
      '.article-content',
      '.entry-content',
      '#content',
      '.main-content',
      '.page-content',
      '.text-content'
    ];

    let extractedContent = '';
    let extractedHtml = '';
    let contentSource = 'body';

    // Try each selector to find the main content
    for (const selector of contentSelectors) {
      const element = $(selector).first();
      if (element.length > 0) {
        extractedContent = element.text();
        extractedHtml = element.html();
        contentSource = selector;
        break;
      }
    }

    // Fallback to body if no specific content area found
    if (!extractedContent) {
      // Remove additional unwanted elements from body
      $('body').find('.cookie-notice, .cookie-banner, .popup, .modal, .overlay, .social-share').remove();
      extractedContent = $('body').text();
      extractedHtml = $('body').html();
      contentSource = 'body (cleaned)';
    }

    // Clean the extracted text
    const cleanedContent = this.cleanExtractedText(extractedContent);

    // Convert HTML to Markdown
    const markdownContent = this.convertHtmlToMarkdown(extractedHtml);

    // Extract publication date
    const publicationDate = this.extractPublicationDate($);

    const result = {
      url: url,
      title: title || 'Untitled',
      description: metaDescription || '',
      content: cleanedContent,
      markdownContent: markdownContent,
      contentSource,
      publicationDate,
      canonical: canonical || url,
      wordCount: cleanedContent.split(/\s+/).filter(word => word.length > 0).length,
      characterCount: cleanedContent.length,
      extractedAt: new Date().toISOString(),
      ...enhancedData
    };

    console.log(`[URLCrawlerService] Successfully extracted ${result.wordCount} words from ${url}`);

    return result;
  }

  /**
   * Gets a preview of content without full crawling (for validation)
   * @param {string} url - The URL to preview
   * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
   */
  async previewUrl(url) {
    try {
      const validation = await this.validateUrl(url);
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

  // Helper methods

  /**
   * Determines if a page requires JavaScript
   * @private
   */
  _requiresJavaScript(error) {
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
   * Cleans extracted text content
   * @param {string} text - Raw extracted text
   * @returns {string} Cleaned text
   */
  cleanExtractedText(text) {
    if (!text) return '';

    return text
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      // Remove excessive line breaks
      .replace(/\n\s*\n\s*\n/g, '\n\n')
      // Trim leading/trailing whitespace
      .trim()
      // Remove common boilerplate text patterns
      .replace(/Cookie\s+(Policy|Notice|Consent)[\s\S]*?(?=\n\n|\n[A-Z]|$)/gi, '')
      .replace(/Accept\s+all\s+cookies?[\s\S]*?(?=\n\n|\n[A-Z]|$)/gi, '')
      // Remove social media sharing text
      .replace(/Share\s+on\s+(Facebook|Twitter|LinkedIn|Instagram)[\s\S]*?(?=\n|\s[A-Z])/gi, '')
      // Clean up remaining whitespace
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Converts HTML content to Markdown format
   * @param {string} html - Raw HTML content
   * @returns {string} Cleaned Markdown content
   */
  convertHtmlToMarkdown(html) {
    if (!html) return '';

    try {
      // Convert HTML to Markdown using turndown
      let markdown = this.turndownService.turndown(html);

      // Clean up the markdown
      markdown = markdown
        // Remove excessive whitespace and line breaks
        .replace(/\n\s*\n\s*\n/g, '\n\n')
        // Clean up lists spacing
        .replace(/(\n- .+)\n\n(\n- .+)/g, '$1\n$2')
        // Remove empty lines at start/end
        .trim();

      return markdown;
    } catch (error) {
      console.warn('[URLCrawlerService] Error converting HTML to Markdown:', error.message);
      // Fallback to plain text extraction if conversion fails
      return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    }
  }

  /**
   * Attempts to extract publication date from the page
   * @param {Object} $ - Cheerio instance
   * @returns {string|null} Publication date or null
   */
  extractPublicationDate($) {
    const dateSelectors = [
      'meta[property="article:published_time"]',
      'meta[name="article:published_time"]',
      'meta[property="og:article:published_time"]',
      'meta[name="published_time"]',
      'meta[name="date"]',
      'time[datetime]',
      '.published-date',
      '.publication-date',
      '.article-date',
      '.post-date'
    ];

    for (const selector of dateSelectors) {
      try {
        let dateValue = null;

        if (selector.includes('meta')) {
          dateValue = $(selector).attr('content');
        } else if (selector.includes('time')) {
          dateValue = $(selector).attr('datetime') || $(selector).text();
        } else {
          dateValue = $(selector).text();
        }

        if (dateValue) {
          // Try to parse the date
          const parsedDate = new Date(dateValue.trim());
          if (!isNaN(parsedDate.getTime())) {
            return parsedDate.toISOString();
          }
        }
      } catch (err) {
        // Continue to next selector
        continue;
      }
    }

    return null;
  }

  /**
   * Extracts enhanced metadata from HTML for rich content like templates
   * @param {Object} $ - Cheerio instance
   * @param {string} url - The source URL for context
   * @returns {Object} Enhanced metadata object
   */
  extractEnhancedMetadata($, url) {
    const enhancedData = {};

    // Extract Open Graph image (preview image)
    const ogImage = $('meta[property="og:image"]').attr('content') ||
                   $('meta[name="twitter:image"]').attr('content') ||
                   $('link[rel="image_src"]').attr('href');

    if (ogImage) {
      // Make URL absolute if relative
      try {
        const imageUrl = new URL(ogImage, url).href;
        enhancedData.previewImage = imageUrl;
      } catch (error) {
        console.warn('[URLCrawlerService] Invalid image URL:', ogImage);
      }
    }

    // Extract dimensions from Open Graph
    const ogWidth = $('meta[property="og:image:width"]').attr('content');
    const ogHeight = $('meta[property="og:image:height"]').attr('content');

    if (ogWidth && ogHeight) {
      enhancedData.dimensions = {
        width: parseInt(ogWidth, 10),
        height: parseInt(ogHeight, 10)
      };
    }

    // Extract categories from various sources
    const categories = new Set();

    // Try meta keywords
    const keywords = $('meta[name="keywords"]').attr('content');
    if (keywords) {
      keywords.split(',').forEach(keyword => {
        const cleaned = keyword.trim().toLowerCase();
        if (cleaned && cleaned.length > 2) {
          categories.add(cleaned);
        }
      });
    }

    // Try Open Graph tags
    const ogTags = $('meta[property="og:tags"]').attr('content') ||
                   $('meta[property="article:tag"]').attr('content');
    if (ogTags) {
      ogTags.split(',').forEach(tag => {
        const cleaned = tag.trim().toLowerCase();
        if (cleaned && cleaned.length > 2) {
          categories.add(cleaned);
        }
      });
    }

    // Try to extract template type/category from title or description
    const titleLower = ($('title').text() || '').toLowerCase();
    const descLower = ($('meta[name="description"]').attr('content') || '').toLowerCase();
    const combinedText = `${titleLower} ${descLower}`;

    const templateTypes = [
      'flyer', 'poster', 'brochure', 'presentation', 'instagram', 'facebook',
      'twitter', 'social media', 'newsletter', 'business card', 'logo',
      'banner', 'story', 'post', 'card', 'invitation', 'resume', 'cv'
    ];

    templateTypes.forEach(type => {
      if (combinedText.includes(type)) {
        categories.add(type);
      }
    });

    if (categories.size > 0) {
      enhancedData.categories = Array.from(categories).slice(0, 5); // Limit to 5 categories
    }

    // Extract additional structured data if available
    const structuredData = this.extractStructuredData($);
    if (structuredData) {
      enhancedData.structuredData = structuredData;
    }

    console.log('[URLCrawlerService] Extracted enhanced metadata:', {
      hasPreviewImage: !!enhancedData.previewImage,
      hasDimensions: !!enhancedData.dimensions,
      categoriesCount: enhancedData.categories?.length || 0
    });

    return enhancedData;
  }

  /**
   * Extracts structured data (JSON-LD, microdata) from HTML
   * @param {Object} $ - Cheerio instance
   * @returns {Object|null} Structured data object or null
   */
  extractStructuredData($) {
    try {
      // Look for JSON-LD structured data
      const jsonLdScript = $('script[type="application/ld+json"]').first();
      if (jsonLdScript.length > 0) {
        const jsonLdText = jsonLdScript.html();
        if (jsonLdText) {
          return JSON.parse(jsonLdText);
        }
      }
    } catch (error) {
      console.warn('[URLCrawlerService] Error parsing structured data:', error.message);
    }

    return null;
  }
}

// Export singleton instance
export const urlCrawlerService = new URLCrawlerService();