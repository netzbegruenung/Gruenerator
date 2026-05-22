/**
 * Content Extractor
 * CMS-specific content extraction for WordPress and Neos
 * Static methods for easy testing
 */

import * as cheerio from 'cheerio';

import type { ExtractedContent } from '../types.js';

interface ContentSelectors {
  title: string[];
  date: string[];
  content: string[];
  categories?: string[];
}

interface SourceConfig {
  cms: 'wordpress' | 'neos' | 'typo3' | 'custom' | 'drupal';
  contentSelectors: ContentSelectors;
}

/**
 * Multi-CMS content extraction
 * Supports WordPress and Neos CMS with different extraction strategies
 */
export class ContentExtractor {
  /**
   * Extract content from WordPress page
   * Handles Elementor, Gutenberg, and classic themes
   */
  static extractContentWordPress(
    $: cheerio.CheerioAPI,
    selectors: ContentSelectors
  ): ExtractedContent {
    // Extract title and date BEFORE cleanup — WordPress themes wrap titles
    // inside <header class="entry-header"> which would be removed below
    let title = '';
    for (const sel of selectors.title) {
      if (sel.startsWith('meta')) {
        title = $(sel).attr('content') || '';
      } else {
        title = $(sel).first().text().trim();
      }
      if (title) break;
    }

    let publishedAt: string | null = null;
    for (const sel of selectors.date) {
      const el = $(sel).first();
      if (el.length) {
        publishedAt = el.attr('datetime') || el.attr('content') || el.text().trim();
        if (publishedAt) break;
      }
    }

    if (publishedAt) {
      publishedAt = ContentExtractor.normalizeGermanDate(publishedAt);
    }

    // Remove unwanted elements (after title/date extraction)
    $('script, style, noscript, iframe, nav, header, footer').remove();
    $('.navigation, .sidebar, .cookie-banner, .cookie-notice, .popup, .modal').remove();
    $('[role="navigation"], [role="banner"], [role="contentinfo"]').remove();
    $('.breadcrumb, .breadcrumb-nav, [aria-label*="Breadcrumb"]').remove();
    $('.social-share, .share-buttons, .related-content, .comments').remove();
    $('.elementor-location-header, .elementor-location-footer').remove();

    // Extract main content
    let contentText = '';
    for (const sel of selectors.content) {
      const el = $(sel);
      if (el.length && el.text().trim().length > 200) {
        contentText = el.text();
        break;
      }
    }

    // Fallback to main/body if no content found
    if (!contentText || contentText.trim().length < 200) {
      contentText = $('main').text() || $('body').text();
    }

    // Extract categories
    const categories: string[] = [];
    const catSelector = selectors.categories?.join(', ') || 'a[rel="category tag"]';
    $(catSelector).each((_, el) => {
      const cat = $(el).text().trim();
      if (cat && !categories.includes(cat)) {
        categories.push(cat);
      }
    });

    // Clean text
    contentText = contentText
      .replace(/\s+/g, ' ') // Collapse whitespace
      .replace(/\n{3,}/g, '\n\n') // Normalize line breaks
      .trim();

    return { title, publishedAt, text: contentText, categories };
  }

  /**
   * Extract content from Neos page
   * Handles Neos CMS-specific structure
   */
  static extractContentNeos($: cheerio.CheerioAPI, selectors: ContentSelectors): ExtractedContent {
    // Extract title and date BEFORE cleanup — Neos may also wrap titles in <header>
    let title = '';
    for (const sel of selectors.title) {
      if (sel.startsWith('meta')) {
        title = $(sel).attr('content') || '';
      } else {
        title = $(sel).first().text().trim();
      }
      if (title) break;
    }

    let publishedAt: string | null = null;
    for (const sel of selectors.date) {
      const el = $(sel).first();
      if (el.length) {
        publishedAt = el.attr('datetime') || el.text().trim();
        if (publishedAt) break;
      }
    }

    if (publishedAt) {
      publishedAt = ContentExtractor.normalizeGermanDate(publishedAt);
    }

    // Remove unwanted elements (after title/date extraction)
    $('script, style, noscript, iframe, nav, header, footer').remove();
    $('.navigation, .cookie-consent, .breadcrumb, .social-share').remove();

    // Extract main content
    let contentText = '';
    for (const sel of selectors.content) {
      const el = $(sel);
      if (el.length && el.text().trim().length > 200) {
        contentText = el.text();
        break;
      }
    }

    // Fallback to main/body if no content found
    if (!contentText || contentText.trim().length < 200) {
      contentText = $('main').text() || $('body').text();
    }

    // Extract categories
    const categories: string[] = [];
    const catSelector = selectors.categories?.join(', ') || 'a[href*="/themen/"]';
    $(catSelector).each((_, el) => {
      const cat = $(el).text().trim();
      if (cat && !categories.includes(cat)) {
        categories.push(cat);
      }
    });

    // Clean text
    contentText = contentText
      .replace(/\s+/g, ' ') // Collapse whitespace
      .replace(/\n{3,}/g, '\n\n') // Normalize line breaks
      .trim();

    return { title, publishedAt, text: contentText, categories };
  }

  /**
   * Extract content from Typo3 page
   * Handles Typo3 CMS with tx_xblog_pi1 blog plugin
   */
  static extractContentTypo3($: cheerio.CheerioAPI, selectors: ContentSelectors): ExtractedContent {
    // Extract title and date BEFORE cleanup
    let title = '';
    for (const sel of selectors.title) {
      if (sel.startsWith('meta')) {
        title = $(sel).attr('content') || '';
      } else {
        title = $(sel).first().text().trim();
      }
      if (title) break;
    }

    let publishedAt: string | null = null;
    for (const sel of selectors.date) {
      const el = $(sel).first();
      if (el.length) {
        publishedAt = el.attr('datetime') || el.attr('content') || el.text().trim();
        if (publishedAt) break;
      }
    }

    // Fallback: some TYPO3 detail pages render the date as a bare <p> with no
    // <time>/datetime/class (e.g. gruene-fraktion-bayern.de). Scan the main
    // content region for the first German long-form date PATTERN — matching the
    // pattern (not a <p> position) skips figure captions and other prose.
    if (!publishedAt) {
      const scanText = $('main, article, .document-content__main, .news-text-wrap').first().text();
      const m = scanText.match(
        /\b(\d{1,2})\.\s*(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+(\d{4})\b/i
      );
      if (m) publishedAt = m[0];
    }

    // Normalize German date formats to ISO
    if (publishedAt) {
      publishedAt = ContentExtractor.normalizeGermanDate(publishedAt);
    }

    // Remove unwanted elements (after title/date extraction)
    $('script, style, noscript, iframe, nav, header, footer').remove();
    $('.navigation, .cookie-consent, .breadcrumb, .social-share').remove();
    // Typo3-specific: remove pagination inside blog plugin
    $('.tx_xblog_pi1 .pagination, .tx_xblog_pi1 .page-navigation').remove();

    // Extract main content
    let contentText = '';
    for (const sel of selectors.content) {
      const el = $(sel);
      if (el.length && el.text().trim().length > 200) {
        contentText = el.text();
        break;
      }
    }

    // Fallback to main/body if no content found
    if (!contentText || contentText.trim().length < 200) {
      contentText = $('main').text() || $('body').text();
    }

    // Extract categories
    const categories: string[] = [];
    const catSelector = selectors.categories?.join(', ') || '.tags a';
    $(catSelector).each((_, el) => {
      const cat = $(el).text().trim();
      if (cat && !categories.includes(cat)) {
        categories.push(cat);
      }
    });

    // Clean text
    contentText = contentText
      .replace(/\s+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return { title, publishedAt, text: contentText, categories };
  }

  /**
   * Normalize German date formats (DD.MM.YY or DD.MM.YYYY) to ISO (YYYY-MM-DD).
   * Passes through already-ISO strings unchanged.
   */
  static normalizeGermanDate(dateStr: string): string {
    const trimmed = dateStr.trim();

    // German long-form text month (e.g., "21. Mai 2026"). Some TYPO3 sites
    // (gruene-fraktion-bayern.de) render the publish date this way with no
    // <time>/datetime markup.
    const textMonthMatch = trimmed.match(
      /(\d{1,2})\.\s*(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+(\d{4})/i
    );
    if (textMonthMatch) {
      const months: Record<string, string> = {
        januar: '01',
        februar: '02',
        märz: '03',
        april: '04',
        mai: '05',
        juni: '06',
        juli: '07',
        august: '08',
        september: '09',
        oktober: '10',
        november: '11',
        dezember: '12',
      };
      const day = textMonthMatch[1].padStart(2, '0');
      const month = months[textMonthMatch[2].toLowerCase()];
      const year = textMonthMatch[3];
      if (month) return `${year}-${month}-${day}`;
    }

    // DD.MM.YYYY (e.g., "19.02.2026"). Try the 4-digit year first so that
    // "02.04.2026" doesn't get partially matched as DD.MM.YY ("02.04.20").
    // The (?!\d) lookahead prevents capturing a 4-digit year as a 2-digit one.
    const longMatch = trimmed.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})(?!\d)/);
    if (longMatch) {
      const day = longMatch[1].padStart(2, '0');
      const month = longMatch[2].padStart(2, '0');
      const year = longMatch[3];
      return `${year}-${month}-${day}`;
    }

    // DD.MM.YY (e.g., "19.02.26")
    const shortMatch = trimmed.match(/(\d{1,2})\.(\d{1,2})\.(\d{2})(?!\d)/);
    if (shortMatch) {
      const day = shortMatch[1].padStart(2, '0');
      const month = shortMatch[2].padStart(2, '0');
      const year = parseInt(shortMatch[3], 10) + 2000;
      return `${year}-${month}-${day}`;
    }

    // Already ISO or other format — pass through
    return trimmed;
  }

  /**
   * Extract page content based on CMS type
   * Fetches URL and routes to appropriate extractor
   */
  static async extractPageContent(
    url: string,
    source: SourceConfig,
    fetchUrl: (url: string) => Promise<Response>
  ): Promise<ExtractedContent> {
    const response = await fetchUrl(url);
    const html = await response.text();
    const $ = cheerio.load(html);

    let extracted: ExtractedContent;
    switch (source.cms) {
      case 'neos':
        extracted = this.extractContentNeos($, source.contentSelectors);
        break;
      case 'typo3':
        extracted = this.extractContentTypo3($, source.contentSelectors);
        break;
      case 'wordpress':
      case 'custom':
      case 'drupal':
      default:
        extracted = this.extractContentWordPress($, source.contentSelectors);
        break;
    }

    return extracted;
  }
}
