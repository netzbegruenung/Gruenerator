/**
 * Link Extractor
 * Extracts article and PDF links with pagination support
 * Dependency injection pattern for testability
 */

import * as cheerio from 'cheerio';

import type { PdfLink } from '../types.js';
import type { CheerioAPI } from 'cheerio';
import type { AnyNode } from 'domhandler';

/**
 * Link extraction with pagination support
 * Dependencies injected via constructor for easy testing
 */
export class LinkExtractor {
  constructor(
    private fetchUrl: (url: string) => Promise<Response>,
    private normalizeUrl: (url: string | undefined, baseUrl: string) => string | null,
    private shouldExcludeUrl: (url: string, patterns?: string[]) => boolean,
    private delay: (ms: number) => Promise<void>
  ) {}

  /**
   * Extract article links from content path with pagination
   * Supports two pagination modes:
   *   1. URL construction (default): builds URLs from paginationPattern + paginationOffset
   *   2. Link-following (paginationLinkSelector): extracts "next page" URLs from HTML
   *      Required for CMS with signed pagination URLs (e.g., Typo3 cHash)
   */
  async extractArticleLinks(
    source: any,
    contentPath: any,
    log: (msg: string) => void
  ): Promise<string[]> {
    const links = new Set<string>();
    let currentPage = 1;
    const maxPages = contentPath.maxPages || 10;
    let nextPageUrl: string | null = null;

    while (currentPage <= maxPages) {
      let pageUrl: string;
      if (currentPage === 1) {
        pageUrl = source.baseUrl + contentPath.path;
      } else if (nextPageUrl && contentPath.paginationLinkSelector) {
        // Link-following pagination: use URL discovered from previous page
        pageUrl = nextPageUrl;
      } else {
        // URL construction pagination
        const offset = contentPath.paginationOffset ?? 0;
        const paginationPath = contentPath.paginationPattern.replace(
          '{page}',
          (currentPage + offset).toString()
        );
        pageUrl = source.baseUrl + contentPath.path + paginationPath;
      }

      try {
        const response = await this.fetchUrl(pageUrl);
        const html = await response.text();
        const $ = cheerio.load(html);

        const beforeCount = links.size;

        // Extract links using content path's list selector
        $(contentPath.listSelector).each((_, el) => {
          const href = $(el).attr('href');
          if (!href) return;

          const normalized = this.normalizeUrl(href, source.baseUrl);
          if (!normalized) return;

          // Apply exclusion patterns
          if (this.shouldExcludeUrl(normalized, source.excludePatterns)) return;

          // Only include links from same domain
          if (!normalized.startsWith(source.baseUrl)) return;

          // Exclude the list page itself
          if (
            normalized !== source.baseUrl + contentPath.path &&
            normalized !== source.baseUrl + contentPath.path + '/'
          ) {
            links.add(normalized);
          }
        });

        // Link-following pagination: find "next page" URL from pagination HTML
        nextPageUrl = null;
        if (contentPath.paginationLinkSelector) {
          $(contentPath.paginationLinkSelector).each((_, el) => {
            if (nextPageUrl) return; // already found
            const text = $(el).text().trim();
            // Match common "next" indicators: > › » "Next" "Weiter"
            if (
              text === '>' ||
              text === '›' ||
              text === '»' ||
              text === '→' ||
              text.toLowerCase() === 'next' ||
              text.toLowerCase() === 'weiter'
            ) {
              const href = $(el).attr('href');
              if (href) {
                const normalized = this.normalizeUrl(href, source.baseUrl);
                if (normalized) {
                  nextPageUrl = normalized;
                }
              }
            }
          });
        }

        const newLinksFound = links.size - beforeCount;
        log(`Page ${currentPage}: found ${newLinksFound} new links (total: ${links.size})`);

        // Stop if no new links found on this page
        if (newLinksFound === 0 && currentPage > 1) {
          break;
        }

        // For link-following: stop if no next page link found
        if (contentPath.paginationLinkSelector && !nextPageUrl) {
          break;
        }

        currentPage++;
        await this.delay(500); // Small delay between pages
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.warn(`[LinkExtractor] Failed to fetch page ${currentPage}: ${errorMessage}`);
        break;
      }
    }

    return Array.from(links);
  }

  /**
   * Extract links from XML sitemaps
   * Fetches multiple sitemaps and filters URLs
   */
  async extractLinksFromSitemaps(
    sitemapUrls: string[],
    filter?: string,
    log?: (msg: string) => void
  ): Promise<string[]> {
    const links = new Set<string>();

    for (const sitemapUrl of sitemapUrls) {
      try {
        const response = await this.fetchUrl(sitemapUrl);
        const xml = await response.text();
        const $ = cheerio.load(xml, { xmlMode: true });

        $('url > loc').each((_, el) => {
          let url = $(el).text().trim();
          if (url) {
            // Apply filter if specified
            if (filter && !url.includes(filter)) return;
            // Canonicalize: strip trailing slash (except root)
            if (url.length > 1 && url.endsWith('/')) {
              url = url.slice(0, -1);
            }
            links.add(url);
          }
        });

        log?.(
          `Sitemap ${sitemapUrl}: found ${links.size} URLs${filter ? ` (filtered by '${filter}')` : ''}`
        );
        await this.delay(300);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.warn(`[LinkExtractor] Failed to fetch sitemap ${sitemapUrl}: ${errorMessage}`);
      }
    }

    return Array.from(links);
  }

  /**
   * Extract PDF links from archive page
   * Returns links with title and context for date extraction
   * Deduplicates by URL (pages may list the same PDF in multiple sections)
   */
  async extractPdfLinks(source: any, contentPath: any): Promise<PdfLink[]> {
    const pageUrl = source.baseUrl + contentPath.path;
    const response = await this.fetchUrl(pageUrl);
    const html = await response.text();
    const $ = cheerio.load(html);

    const pdfLinks: PdfLink[] = [];
    const seen = new Set<string>();

    $(contentPath.listSelector).each((_, el) => {
      const href = $(el).attr('href');
      if (href && (href.includes('.pdf') || href.includes('/download/'))) {
        const normalizedUrl = this.normalizeUrl(href, source.baseUrl);
        if (normalizedUrl) {
          if (seen.has(normalizedUrl)) return;
          seen.add(normalizedUrl);

          pdfLinks.push({
            url: normalizedUrl,
            title: $(el).text().trim() || $(el).attr('title') || 'Dokument',
            context: this.extractContextWithHeadings($, el),
          });
        }
      }
    });

    return pdfLinks;
  }

  /**
   * Extract context text including nearest preceding heading
   * PDF archive pages often have dates in <h3>/<h4> headings above groups of links.
   * Walks up to the nearest container, then looks for preceding headings.
   */
  private extractContextWithHeadings($: CheerioAPI, el: AnyNode): string {
    const parentText = $(el).parent().text().trim().substring(0, 200);

    // Walk up to the nearest structural container
    const container = $(el).closest('div, section, article, li');
    if (!container.length) return parentText;

    // Look for preceding h3/h4 headings (sibling to the container or its ancestors)
    let headingText = '';
    let current = container;
    for (let depth = 0; depth < 4; depth++) {
      const heading = current.prevAll('h3, h4, h2').first();
      if (heading.length) {
        headingText = heading.text().trim();
        break;
      }
      const parent = current.parent();
      if (!parent.length || parent.is('body, html')) break;
      current = parent;
    }

    if (!headingText) return parentText;
    return `${headingText} | ${parentText}`.substring(0, 300);
  }
}
