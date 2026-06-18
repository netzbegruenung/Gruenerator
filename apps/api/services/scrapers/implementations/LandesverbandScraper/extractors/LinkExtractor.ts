/**
 * Link Extractor
 * Extracts article and PDF links with pagination support
 * Dependency injection pattern for testability
 */

import * as cheerio from 'cheerio';

import { DateExtractor } from './DateExtractor.js';

import type {
  LandesverbandSource,
  ContentPath,
} from '../../../../../config/landesverbaendeConfig.js';
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
    source: LandesverbandSource,
    contentPath: ContentPath,
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
      } else if (contentPath.paginationPattern) {
        // URL construction pagination
        const offset = contentPath.paginationOffset ?? 0;
        const paginationPath = contentPath.paginationPattern.replace(
          '{page}',
          (currentPage + offset).toString()
        );
        pageUrl = source.baseUrl + contentPath.path + paginationPath;
      } else {
        break; // No pagination pattern available, stop
      }

      try {
        const response = await this.fetchUrl(pageUrl);
        const html = await response.text();
        const $ = cheerio.load(html);

        // Date-aware early-stop ("5-year gap"): when paginateWithinAgeLimit is set,
        // stop once a listing page holds no in-window item. Listings are reverse-
        // chronological, so the first all-stale page means everything beyond it is
        // stale too — bounding discovery to the source's age window instead of the
        // crude maxPages, which otherwise over-crawls (HE partei: 10y of pages, most
        // fetched-then-rejected at store) or under-crawls (HE fraktion: stops at 2.5y).
        // The store-stage age filter still drops the few boundary stragglers on the
        // last kept page. Safe fallback: if no date parses (selector absent/format
        // unknown), sawInWindow never flips false so we never early-stop — maxPages /
        // no-new-links keep bounding. Gated to currentPage > 1 so page 1 is always read.
        const ageLimit = source.maxAgeYears;
        if (contentPath.paginateWithinAgeLimit && ageLimit != null && currentPage > 1) {
          const dateSelector = source.contentSelectors.date.join(', ');
          let sawDate = false;
          let sawInWindow = false;
          $(dateSelector).each((_, el) => {
            const parsed = DateExtractor.parseGermanDate($(el).text());
            if (!parsed) return;
            sawDate = true;
            if (!DateExtractor.isDateTooOld(parsed, ageLimit)) sawInWindow = true;
          });
          if (sawDate && !sawInWindow) {
            log(`Page ${currentPage}: all items older than ${ageLimit}y — stopping at age window`);
            break;
          }
        }

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
            // Match common "next" indicators: > › » "Next" "Weiter" "Vor"
            if (
              text === '>' ||
              text === '›' ||
              text === '»' ||
              text === '→' ||
              text.toLowerCase() === 'next' ||
              text.toLowerCase() === 'weiter' ||
              text.toLowerCase() === 'vor'
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
   * Extract links from XML sitemaps. Handles both leaf sitemaps (<urlset>)
   * and sitemap indexes (<sitemapindex>) by recursing one level into child
   * sitemaps. TYPO3 SEO and WordPress core sitemaps both use this pattern.
   */
  async extractLinksFromSitemaps(
    sitemapUrls: string[],
    filter?: string,
    log?: (msg: string) => void,
    depth = 0
  ): Promise<string[]> {
    const MAX_DEPTH = 2;
    const links = new Set<string>();

    for (const sitemapUrl of sitemapUrls) {
      try {
        const response = await this.fetchUrl(sitemapUrl);
        const xml = await response.text();
        const $ = cheerio.load(xml, { xmlMode: true });

        // Sitemap index: collect child sitemap URLs and recurse.
        const childSitemaps: string[] = [];
        $('sitemap > loc').each((_, el) => {
          const url = $(el).text().trim();
          if (url) childSitemaps.push(url);
        });

        if (childSitemaps.length > 0) {
          if (depth >= MAX_DEPTH) {
            log?.(
              `Sitemap ${sitemapUrl}: reached MAX_DEPTH=${MAX_DEPTH}, not recursing into ${childSitemaps.length} children`
            );
          } else {
            log?.(
              `Sitemap index ${sitemapUrl}: recursing into ${childSitemaps.length} child sitemaps`
            );
            const childLinks = await this.extractLinksFromSitemaps(
              childSitemaps,
              filter,
              log,
              depth + 1
            );
            for (const link of childLinks) links.add(link);
          }
        }

        // Leaf sitemap: collect article URLs. Pipe through normalizeUrl so any
        // injected canonicalization (e.g. TYPO3 alias rewrites in the parent
        // scraper) applies before dedup and filter, and so the resulting URLs
        // match what would be discovered via HTML listings.
        $('url > loc').each((_, el) => {
          const rawUrl = $(el).text().trim();
          if (!rawUrl) return;
          const url = this.normalizeUrl(rawUrl, '') ?? rawUrl;
          if (filter && !url.includes(filter)) return;
          links.add(url);
        });

        log?.(
          `Sitemap ${sitemapUrl}: total ${links.size} URLs${filter ? ` (filtered by '${filter}')` : ''}`
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
  async extractPdfLinks(source: LandesverbandSource, contentPath: ContentPath): Promise<PdfLink[]> {
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
