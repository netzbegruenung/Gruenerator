/**
 * Website Crawler
 * Recursively crawls websites with BFS strategy
 * Optimized for German Green Party websites (TYPO3 support)
 */

import { URL } from 'url';

import * as cheerio from 'cheerio';

import { BRAND } from '../../../utils/domainUtils.js';
import { createLogger } from '../../../utils/logger.js';
import { BaseScraper } from '../base/BaseScraper.js';

import type { ScraperResult } from '../types.js';
import type { Element, AnyNode } from 'domhandler';

const log = createLogger('WebsiteCrawler');

/**
 * Crawler configuration options
 */
export interface WebsiteCrawlerOptions {
  /** Base URL to crawl */
  baseUrl?: string;
  /** Allowed URL paths to crawl */
  allowedPaths?: string[];
  /** Maximum depth to crawl */
  maxDepth?: number;
  /** Maximum pages to crawl */
  maxPages?: number;
  /** Delay between requests in ms */
  crawlDelay?: number;
  /** Request timeout in ms */
  timeout?: number;
  /** Minimum date for content (skip older content) */
  minDate?: string | Date | null;
}

/**
 * Crawled page data
 */
export interface CrawledPage {
  source_url: string;
  html: string;
  title: string;
  text: string;
  markdown: string;
  description: string;
  published_at: string | null;
  content_hash: string;
  indexed_at: string;
  primary_category?: string;
  depth?: number;
}

/**
 * Extracted content from HTML
 */
interface ExtractedContent {
  title: string;
  text: string;
  markdown: string;
  description: string;
  publishedAt: string | null;
}

/**
 * Queue item for BFS crawling
 */
interface QueueItem {
  url: string;
  depth: number;
}

/**
 * Crawl error record
 */
interface CrawlError {
  url: string;
  error: string;
}

/**
 * Crawl statistics
 */
export interface CrawlStats {
  pagesFound: number;
  pagesVisited: number;
  errors: number;
  queueRemaining: number;
  skippedOldContent: number;
}

/**
 * Website crawler with recursive BFS
 */
export class WebsiteCrawler extends BaseScraper {
  private baseUrl: string;
  private allowedPaths: string[];
  private maxDepth: number;
  private maxPages: number;
  private crawlDelay: number;
  private timeout: number;
  private userAgent: string;
  private minDate: Date | null;
  private queue: QueueItem[];
  private results: CrawledPage[];
  private errors: CrawlError[];
  private skippedOldContent: number;

  constructor(options: WebsiteCrawlerOptions = {}) {
    super({
      collectionName: 'website_content',
      verbose: true,
    });

    this.baseUrl = options.baseUrl || 'https://www.gruene-bundestag.de';
    this.allowedPaths = options.allowedPaths || ['/unsere-politik/', '/presse/'];
    this.maxDepth = options.maxDepth || 10;
    this.maxPages = options.maxPages || 10000;
    this.crawlDelay = options.crawlDelay || 1000;
    this.timeout = options.timeout || 30000;
    this.userAgent = BRAND.botUserAgent;
    this.minDate = options.minDate ? new Date(options.minDate) : null;

    this.queue = [];
    this.results = [];
    this.errors = [];
    this.skippedOldContent = 0;
  }

  /**
   * Main scraping method (implements abstract method from BaseScraper)
   */
  async scrape(): Promise<ScraperResult> {
    const startTime = Date.now();
    const pages = await this.crawlSite();

    return {
      documentsProcessed: pages.length,
      chunksCreated: 0, // Note: This crawler doesn't chunk, just returns raw pages
      vectorsStored: 0,
      errors: this.errors.map((e) => e.error),
      duration: Date.now() - startTime,
    };
  }

  /**
   * Crawl the entire site starting from allowed paths
   */
  async crawlSite(): Promise<CrawledPage[]> {
    log.info(`Starting site crawl for ${this.baseUrl}`);
    log.info(`Allowed paths: ${this.allowedPaths.join(', ')}`);
    log.info(`Max depth: ${this.maxDepth}, Max pages: ${this.maxPages}`);

    // Start with root pages of allowed paths
    for (const path of this.allowedPaths) {
      const startUrl = new URL(path, this.baseUrl).href;
      this.queue.push({ url: startUrl, depth: 0 });
    }

    // Process queue with BFS
    while (this.queue.length > 0 && this.results.length < this.maxPages) {
      const item = this.queue.shift();
      if (!item) continue;

      const { url, depth } = item;

      if (this.visitedUrls.has(url)) {
        continue;
      }

      if (depth > this.maxDepth) {
        continue;
      }

      this.visitedUrls.add(url);

      try {
        log.info(`[${this.results.length + 1}/${this.maxPages}] ${url}`);

        const pageData = await this.#crawlPage(url);

        if (pageData) {
          // Determine primary category from URL path
          pageData.primary_category = this.#getSectionFromUrl(url);
          pageData.depth = depth;

          // Check date filter - skip content older than minDate
          if (this.minDate && pageData.published_at) {
            const publishedDate = new Date(pageData.published_at);
            if (publishedDate < this.minDate) {
              this.skippedOldContent++;
              log.debug(`Skipping old content (${pageData.published_at}): ${url}`);
              // Still extract links to find newer content
              if (depth < this.maxDepth) {
                const links = this.#extractInternalLinks(pageData.html, url);
                for (const link of links) {
                  if (!this.visitedUrls.has(link) && this.#isAllowedUrl(link)) {
                    this.queue.push({ url: link, depth: depth + 1 });
                  }
                }
              }
              await this.delay(this.crawlDelay);
              continue;
            }
          }

          this.results.push(pageData);

          // Extract and queue internal links
          if (depth < this.maxDepth) {
            const links = this.#extractInternalLinks(pageData.html, url);
            for (const link of links) {
              if (!this.visitedUrls.has(link) && this.#isAllowedUrl(link)) {
                this.queue.push({ url: link, depth: depth + 1 });
              }
            }
          }
        }

        // Polite delay between requests
        await this.delay(this.crawlDelay);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        log.error(`Failed to crawl ${url}: ${errorMessage}`);
        this.errors.push({ url, error: errorMessage });
      }
    }

    log.info(`Crawl complete: ${this.results.length} pages, ${this.errors.length} errors`);

    return this.results;
  }

  /**
   * Crawl a single page
   */
  async #crawlPage(url: string): Promise<CrawledPage | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': this.userAgent,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('text/html')) {
        log.debug(`Skipping non-HTML content at ${url}: ${contentType}`);
        return null;
      }

      const html = await response.text();
      const content = this.#extractContent(html, url);

      if (!content.text || content.text.trim().length < 100) {
        log.debug(`Skipping low-content page at ${url}`);
        return null;
      }

      return {
        source_url: url,
        html,
        title: content.title,
        text: content.text,
        markdown: content.markdown,
        description: content.description,
        published_at: content.publishedAt,
        content_hash: this.generateHash(content.text),
        indexed_at: new Date().toISOString(),
      };
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw error;
    }
  }

  /**
   * Extract content from HTML
   * Supports TYPO3 search markers
   */
  #extractContent(html: string, url: string): ExtractedContent {
    // TYPO3 sites often use search markers to define indexable content
    // Extract only the content between TYPO3SEARCH markers if they exist
    const typo3Match = html.match(/<!--TYPO3SEARCH_begin-->([\s\S]*?)<!--TYPO3SEARCH_end-->/);
    const htmlToProcess = typo3Match ? typo3Match[1] : html;

    const $ = cheerio.load(htmlToProcess);

    // Remove unwanted elements
    $('script, style, noscript, iframe, nav, header, footer').remove();
    $('.navigation, .sidebar, .cookie-banner, .cookie-notice, .popup, .modal, .ads').remove();
    $('[role="navigation"], [role="banner"], [role="contentinfo"]').remove();
    // Remove breadcrumb navigation
    $('.breadcrumb-nav, #breadcrumb-nav, [aria-label*="Breadcrumb"]').remove();
    // Remove mega menu teasers (they contain other article content)
    $('.mega-menu__teaser, .mega-menu__teasers, .mega-menu').remove();

    // Extract metadata
    const title =
      $('title').text().trim() ||
      $('h1').first().text().trim() ||
      $('meta[property="og:title"]').attr('content') ||
      'Untitled';

    const description =
      $('meta[name="description"]').attr('content') ||
      $('meta[property="og:description"]').attr('content') ||
      '';

    // Content extraction selectors (German-optimized)
    const contentSelectors = [
      'article',
      'main',
      '[role="main"]',
      '.content',
      '.article-content',
      '.post-content',
      '.entry-content',
      '#content',
      '.main-content',
      '.inhalt',
      '#inhalt',
      '.hauptinhalt',
      '.artikel',
      '.beitrag',
      '.textbereich',
    ];

    let contentElement: cheerio.Cheerio<AnyNode> | null = null;
    for (const selector of contentSelectors) {
      const el = $(selector).first();
      if (el.length > 0 && el.text().trim().length > 100) {
        contentElement = el;
        break;
      }
    }

    // Fallback to body
    if (!contentElement || contentElement.length === 0) {
      contentElement = $('body');
    }

    // Clean text
    const text = this.#cleanText(contentElement.text());

    // Convert to markdown (simple version)
    const markdown = this.#htmlToMarkdown(contentElement.html() || '');

    // Extract publication date
    const publishedAt = this.#extractPublishedDate($);

    return {
      title: this.#cleanText(title),
      text,
      markdown,
      description: this.#cleanText(description),
      publishedAt,
    };
  }

  /**
   * Extract internal links from HTML
   */
  #extractInternalLinks(html: string, currentUrl: string): string[] {
    const $ = cheerio.load(html);
    const links = new Set<string>();
    const baseUrlObj = new URL(this.baseUrl);

    $('a[href]').each((_, element) => {
      try {
        const href = $(element).attr('href');
        if (!href) return;

        // Skip anchors, javascript, mailto, tel
        if (
          href.startsWith('#') ||
          href.startsWith('javascript:') ||
          href.startsWith('mailto:') ||
          href.startsWith('tel:')
        ) {
          return;
        }

        // Resolve relative URLs
        const absoluteUrl = new URL(href, currentUrl);

        // Only include same-domain links
        if (absoluteUrl.hostname !== baseUrlObj.hostname) {
          return;
        }

        // Normalize URL (remove fragment, query params)
        absoluteUrl.hash = '';
        absoluteUrl.search = '';
        const normalizedUrl = absoluteUrl.href;

        // Check if URL is in allowed paths
        if (this.#isAllowedUrl(normalizedUrl)) {
          links.add(normalizedUrl);
        }
      } catch (e) {
        // Invalid URL, skip
      }
    });

    return Array.from(links);
  }

  /**
   * Check if URL is in allowed paths
   */
  #isAllowedUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;

      // Check if pathname starts with any allowed path
      return this.allowedPaths.some((allowedPath) => pathname.startsWith(allowedPath));
    } catch {
      return false;
    }
  }

  /**
   * Get section name from URL
   */
  #getSectionFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;

      for (const allowedPath of this.allowedPaths) {
        if (pathname.startsWith(allowedPath)) {
          // Extract section name (e.g., /unsere-politik/ -> unsere-politik)
          return allowedPath.replace(/^\/|\/$/g, '');
        }
      }
      return 'other';
    } catch {
      return 'unknown';
    }
  }

  /**
   * Extract publication date from page
   */
  #extractPublishedDate($: cheerio.CheerioAPI): string | null {
    // Try various date selectors
    const dateSelectors = [
      'meta[property="article:published_time"]',
      'meta[name="date"]',
      'meta[name="DC.date"]',
      'time[datetime]',
      '.date',
      '.published',
      '.post-date',
      '.artikel-datum',
      '.datum',
    ];

    for (const selector of dateSelectors) {
      const el = $(selector).first();
      if (el.length > 0) {
        const dateStr = el.attr('content') || el.attr('datetime') || el.text();
        if (dateStr) {
          try {
            const date = new Date(dateStr);
            if (!isNaN(date.getTime())) {
              return date.toISOString();
            }
          } catch {
            // Invalid date, continue
          }
        }
      }
    }

    return null;
  }

  /**
   * Clean extracted text
   */
  #cleanText(text: string): string {
    if (!text) return '';

    return text
      .replace(/\s+/g, ' ') // Collapse whitespace
      .replace(/\n\s*\n/g, '\n\n') // Normalize line breaks
      .replace(/^\s+|\s+$/g, '') // Trim
      .trim();
  }

  /**
   * Simple HTML to Markdown conversion
   */
  #htmlToMarkdown(html: string): string {
    if (!html) return '';

    const $ = cheerio.load(html);

    // Convert headings
    $('h1, h2, h3, h4, h5, h6').each((_, el) => {
      const level = parseInt((el as Element).tagName.charAt(1));
      const prefix = '#'.repeat(level) + ' ';
      $(el).replaceWith(prefix + $(el).text() + '\n\n');
    });

    // Convert paragraphs
    $('p').each((_, el) => {
      $(el).replaceWith($(el).text() + '\n\n');
    });

    // Convert lists
    $('ul, ol').each((_, el) => {
      $(el)
        .find('li')
        .each((i, li) => {
          const isOrdered = (el as Element).tagName.toLowerCase() === 'ol';
          const prefix = isOrdered ? `${i + 1}. ` : '- ';
          $(li).replaceWith(prefix + $(li).text() + '\n');
        });
    });

    // Convert bold/strong
    $('strong, b').each((_, el) => {
      $(el).replaceWith('**' + $(el).text() + '**');
    });

    // Convert italic/em
    $('em, i').each((_, el) => {
      $(el).replaceWith('*' + $(el).text() + '*');
    });

    return this.#cleanText($.text());
  }

  /**
   * Get crawl statistics
   */
  getStats(): CrawlStats {
    return {
      pagesFound: this.results.length,
      pagesVisited: this.visitedUrls.size,
      errors: this.errors.length,
      queueRemaining: this.queue.length,
      skippedOldContent: this.skippedOldContent,
    };
  }

  /**
   * Reset crawler state for new crawl
   */
  reset(): void {
    this.visitedUrls.clear();
    this.queue = [];
    this.results = [];
    this.errors = [];
    this.skippedOldContent = 0;
  }
}

// Export class (no singleton - this crawler is stateful and needs to be instantiated)
export { WebsiteCrawler as WebsiteCrawlerService };
export default WebsiteCrawler;
