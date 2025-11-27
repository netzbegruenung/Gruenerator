import * as cheerio from 'cheerio';
import { URL } from 'url';
import crypto from 'crypto';
import { createLogger } from '../utils/logger.js';

const log = createLogger('WebsiteCrawler');

/**
 * Website Crawler Service
 * Recursively crawls websites and extracts content for indexing
 */
class WebsiteCrawlerService {
    constructor(options = {}) {
        this.baseUrl = options.baseUrl || 'https://www.gruene-bundestag.de';
        this.allowedPaths = options.allowedPaths || ['/unsere-politik/', '/presse/'];
        this.maxDepth = options.maxDepth || 10;
        this.maxPages = options.maxPages || 10000;
        this.crawlDelay = options.crawlDelay || 1000; // 1 second between requests
        this.timeout = options.timeout || 30000;
        this.userAgent = 'Gruenerator-Bot/1.0 (+https://gruenerator.de)';

        // Date filter: only include content from this date onwards
        this.minDate = options.minDate || null; // ISO date string or Date object

        this.visited = new Set();
        this.queue = [];
        this.results = [];
        this.errors = [];
        this.skippedOldContent = 0;
    }

    /**
     * Crawl the entire site starting from allowed paths
     * @returns {Promise<Array>} Array of crawled page objects
     */
    async crawlSite() {
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
            const { url, depth } = this.queue.shift();

            if (this.visited.has(url)) {
                continue;
            }

            if (depth > this.maxDepth) {
                continue;
            }

            this.visited.add(url);

            try {
                log.info(`[${this.results.length + 1}/${this.maxPages}] ${url}`);

                const pageData = await this.crawlPage(url);

                if (pageData) {
                    // Determine section from URL
                    pageData.section = this.getSectionFromUrl(url);
                    pageData.depth = depth;

                    // Check date filter - skip content older than minDate
                    if (this.minDate && pageData.published_at) {
                        const publishedDate = new Date(pageData.published_at);
                        const minDateObj = new Date(this.minDate);
                        if (publishedDate < minDateObj) {
                            this.skippedOldContent++;
                            log.debug(`Skipping old content (${pageData.published_at}): ${url}`);
                            // Still extract links to find newer content
                            if (depth < this.maxDepth) {
                                const links = this.extractInternalLinks(pageData.html, url);
                                for (const link of links) {
                                    if (!this.visited.has(link) && this.isAllowedUrl(link)) {
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
                        const links = this.extractInternalLinks(pageData.html, url);
                        for (const link of links) {
                            if (!this.visited.has(link) && this.isAllowedUrl(link)) {
                                this.queue.push({ url: link, depth: depth + 1 });
                            }
                        }
                    }
                }

                // Polite delay between requests
                await this.delay(this.crawlDelay);

            } catch (error) {
                log.error(`Failed to crawl ${url}: ${error.message}`);
                this.errors.push({ url, error: error.message });
            }
        }

        log.info(`Crawl complete: ${this.results.length} pages, ${this.errors.length} errors`);

        return this.results;
    }

    /**
     * Crawl a single page
     * @param {string} url - URL to crawl
     * @returns {Promise<Object|null>} Page data or null
     */
    async crawlPage(url) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'User-Agent': this.userAgent,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8'
                },
                signal: controller.signal
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
            const content = this.extractContent(html, url);

            if (!content.text || content.text.trim().length < 100) {
                log.debug(`Skipping low-content page at ${url}`);
                return null;
            }

            return {
                url,
                html,
                title: content.title,
                text: content.text,
                markdown: content.markdown,
                description: content.description,
                published_at: content.publishedAt,
                content_hash: this.generateContentHash(content.text),
                crawled_at: new Date().toISOString()
            };

        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('Request timeout');
            }
            throw error;
        }
    }

    /**
     * Extract content from HTML
     * @param {string} html - Raw HTML
     * @param {string} url - Source URL
     * @returns {Object} Extracted content
     */
    extractContent(html, url) {
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
        const title = $('title').text().trim() ||
                     $('h1').first().text().trim() ||
                     $('meta[property="og:title"]').attr('content') ||
                     'Untitled';

        const description = $('meta[name="description"]').attr('content') ||
                           $('meta[property="og:description"]').attr('content') || '';

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
            '.textbereich'
        ];

        let contentElement = null;
        for (const selector of contentSelectors) {
            const el = $(selector).first();
            if (el.length > 0 && el.text().trim().length > 100) {
                contentElement = el;
                break;
            }
        }

        // Fallback to body
        if (!contentElement) {
            contentElement = $('body');
        }

        // Clean text
        const text = this.cleanText(contentElement.text());

        // Convert to markdown (simple version)
        const markdown = this.htmlToMarkdown(contentElement.html() || '');

        // Extract publication date
        const publishedAt = this.extractPublishedDate($);

        return {
            title: this.cleanText(title),
            text,
            markdown,
            description: this.cleanText(description),
            publishedAt
        };
    }

    /**
     * Extract internal links from HTML
     * @param {string} html - Raw HTML
     * @param {string} currentUrl - Current page URL
     * @returns {Array<string>} Array of internal URLs
     */
    extractInternalLinks(html, currentUrl) {
        const $ = cheerio.load(html);
        const links = new Set();
        const baseUrlObj = new URL(this.baseUrl);

        $('a[href]').each((_, element) => {
            try {
                const href = $(element).attr('href');
                if (!href) return;

                // Skip anchors, javascript, mailto, tel
                if (href.startsWith('#') ||
                    href.startsWith('javascript:') ||
                    href.startsWith('mailto:') ||
                    href.startsWith('tel:')) {
                    return;
                }

                // Resolve relative URLs
                const absoluteUrl = new URL(href, currentUrl);

                // Only include same-domain links
                if (absoluteUrl.hostname !== baseUrlObj.hostname) {
                    return;
                }

                // Normalize URL (remove fragment, trailing slash)
                absoluteUrl.hash = '';
                let normalizedUrl = absoluteUrl.href;

                // Remove query parameters for deduplication
                absoluteUrl.search = '';
                normalizedUrl = absoluteUrl.href;

                // Check if URL is in allowed paths
                if (this.isAllowedUrl(normalizedUrl)) {
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
     * @param {string} url - URL to check
     * @returns {boolean}
     */
    isAllowedUrl(url) {
        try {
            const urlObj = new URL(url);
            const pathname = urlObj.pathname;

            // Check if pathname starts with any allowed path
            return this.allowedPaths.some(allowedPath =>
                pathname.startsWith(allowedPath)
            );
        } catch {
            return false;
        }
    }

    /**
     * Get section name from URL
     * @param {string} url - URL to analyze
     * @returns {string} Section name
     */
    getSectionFromUrl(url) {
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
     * @param {CheerioAPI} $ - Cheerio instance
     * @returns {string|null} ISO date string or null
     */
    extractPublishedDate($) {
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
            '.datum'
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
     * @param {string} text - Raw text
     * @returns {string} Cleaned text
     */
    cleanText(text) {
        if (!text) return '';

        return text
            .replace(/\s+/g, ' ')           // Collapse whitespace
            .replace(/\n\s*\n/g, '\n\n')    // Normalize line breaks
            .replace(/^\s+|\s+$/g, '')      // Trim
            .trim();
    }

    /**
     * Simple HTML to Markdown conversion
     * @param {string} html - HTML content
     * @returns {string} Markdown text
     */
    htmlToMarkdown(html) {
        if (!html) return '';

        const $ = cheerio.load(html);

        // Convert headings
        $('h1, h2, h3, h4, h5, h6').each((_, el) => {
            const level = parseInt(el.tagName.charAt(1));
            const prefix = '#'.repeat(level) + ' ';
            $(el).replaceWith(prefix + $(el).text() + '\n\n');
        });

        // Convert paragraphs
        $('p').each((_, el) => {
            $(el).replaceWith($(el).text() + '\n\n');
        });

        // Convert lists
        $('ul, ol').each((_, el) => {
            $(el).find('li').each((i, li) => {
                const isOrdered = el.tagName.toLowerCase() === 'ol';
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

        return this.cleanText($.text());
    }

    /**
     * Generate content hash for change detection
     * @param {string} content - Content to hash
     * @returns {string} SHA-256 hash
     */
    generateContentHash(content) {
        return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
    }

    /**
     * Delay helper
     * @param {number} ms - Milliseconds to delay
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get crawl statistics
     * @returns {Object} Statistics
     */
    getStats() {
        return {
            pagesFound: this.results.length,
            pagesVisited: this.visited.size,
            errors: this.errors.length,
            queueRemaining: this.queue.length,
            skippedOldContent: this.skippedOldContent
        };
    }

    /**
     * Reset crawler state for new crawl
     */
    reset() {
        this.visited.clear();
        this.queue = [];
        this.results = [];
        this.errors = [];
    }
}

export { WebsiteCrawlerService };
export default WebsiteCrawlerService;
