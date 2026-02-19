/**
 * Link Extractor
 * Extracts article and PDF links with pagination support
 * Dependency injection pattern for testability
 */

import * as cheerio from 'cheerio';

import type { PdfLink } from '../types.js';

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
   * Automatically discovers and follows pagination
   */
  async extractArticleLinks(
    source: any,
    contentPath: any,
    log: (msg: string) => void
  ): Promise<string[]> {
    const links = new Set<string>();
    let currentPage = 1;
    const maxPages = contentPath.maxPages || 10;

    while (currentPage <= maxPages) {
      let pageUrl: string;
      if (currentPage === 1) {
        pageUrl = source.baseUrl + contentPath.path;
      } else {
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

        const newLinksFound = links.size - beforeCount;
        log(`Page ${currentPage}: found ${newLinksFound} new links (total: ${links.size})`);

        // Stop if no new links found on this page
        if (newLinksFound === 0 && currentPage > 1) {
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
          const url = $(el).text().trim();
          if (url) {
            // Apply filter if specified
            if (filter && !url.includes(filter)) return;
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
   */
  async extractPdfLinks(source: any, contentPath: any): Promise<PdfLink[]> {
    const pageUrl = source.baseUrl + contentPath.path;
    const response = await this.fetchUrl(pageUrl);
    const html = await response.text();
    const $ = cheerio.load(html);

    const pdfLinks: PdfLink[] = [];
    $(contentPath.listSelector).each((_, el) => {
      const href = $(el).attr('href');
      if (href && (href.includes('.pdf') || href.includes('/download/'))) {
        const normalizedUrl = this.normalizeUrl(href, source.baseUrl);
        if (normalizedUrl) {
          pdfLinks.push({
            url: normalizedUrl,
            title: $(el).text().trim() || $(el).attr('title') || 'Dokument',
            context: $(el).parent().text().trim().substring(0, 200), // Surrounding text for date extraction
          });
        }
      }
    });

    return pdfLinks;
  }
}
