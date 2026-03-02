/**
 * Content Extractor
 * CMS-specific content extraction for WordPress and Neos
 * Static methods for easy testing
 */

import * as cheerio from 'cheerio';

import type { ExtractedContent } from '../types.js';

/**
 * Multi-CMS content extraction
 * Supports WordPress and Neos CMS with different extraction strategies
 */
export class ContentExtractor {
  /**
   * Extract content from WordPress page
   * Handles Elementor, Gutenberg, and classic themes
   */
  static extractContentWordPress($: cheerio.CheerioAPI, selectors: any): ExtractedContent {
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
  static extractContentNeos($: cheerio.CheerioAPI, selectors: any): ExtractedContent {
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
  static extractContentTypo3($: cheerio.CheerioAPI, selectors: any): ExtractedContent {
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

    // DD.MM.YY (e.g., "19.02.26")
    const shortMatch = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2})$/);
    if (shortMatch) {
      const day = shortMatch[1].padStart(2, '0');
      const month = shortMatch[2].padStart(2, '0');
      const year = parseInt(shortMatch[3], 10) + 2000;
      return `${year}-${month}-${day}`;
    }

    // DD.MM.YYYY (e.g., "19.02.2026")
    const longMatch = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (longMatch) {
      const day = longMatch[1].padStart(2, '0');
      const month = longMatch[2].padStart(2, '0');
      const year = longMatch[3];
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
    source: any,
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
      default:
        extracted = this.extractContentWordPress($, source.contentSelectors);
        break;
    }

    return extracted;
  }
}
