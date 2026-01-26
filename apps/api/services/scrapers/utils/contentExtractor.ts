/**
 * Content extraction utilities
 * High-level functions for extracting structured content from web pages
 */

import * as cheerio from 'cheerio';
import type { HtmlExtractionOptions, ExtractionResult } from '../types.js';
import { cleanText, removeUnwantedElements, extractTitle } from './htmlCleaner.js';

/**
 * Extract main content from HTML using selectors
 */
export function extractMainContent(
  html: string,
  options: HtmlExtractionOptions = {}
): ExtractionResult {
  try {
    const $ = cheerio.load(html);

    // Remove unwanted elements
    if (options.removeSelectors) {
      removeUnwantedElements($, options.removeSelectors);
    } else {
      removeUnwantedElements($);
    }

    let content = '';

    // Try content selectors in order
    if (options.contentSelectors && options.contentSelectors.length > 0) {
      for (const selector of options.contentSelectors) {
        const element = $(selector);
        if (element.length > 0) {
          content = element.html() || '';
          break;
        }
      }
    }

    // Fallback to common content selectors
    if (!content) {
      const fallbackSelectors = [
        'article',
        '.content',
        '.main-content',
        'main',
        '#content',
        '.post-content',
        '.entry-content',
      ];

      for (const selector of fallbackSelectors) {
        const element = $(selector);
        if (element.length > 0) {
          content = element.html() || '';
          break;
        }
      }
    }

    // Final fallback to body
    if (!content) {
      content = $('body').html() || '';
    }

    const title = extractTitle(html);

    return {
      content: cleanText($(content).text()),
      title: title || undefined,
      success: true,
    };
  } catch (error) {
    return {
      content: '',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Extract date from HTML (multiple strategies)
 */
export function extractDate(html: string): string | null {
  const $ = cheerio.load(html);

  // Try meta tags first
  const metaDate =
    $('meta[property="article:published_time"]').attr('content') ||
    $('meta[name="date"]').attr('content') ||
    $('meta[name="publishdate"]').attr('content') ||
    $('meta[property="og:published_time"]').attr('content');

  if (metaDate) return metaDate;

  // Try time elements
  const timeElement = $('time[datetime]').first().attr('datetime');
  if (timeElement) return timeElement;

  // Try common date classes
  const dateSelectors = ['.date', '.published', '.post-date', '.article-date'];
  for (const selector of dateSelectors) {
    const dateText = $(selector).first().text().trim();
    if (dateText) return dateText;
  }

  return null;
}

/**
 * Extract author from HTML
 */
export function extractAuthor(html: string): string | null {
  const $ = cheerio.load(html);

  // Try meta tags first
  const metaAuthor =
    $('meta[name="author"]').attr('content') ||
    $('meta[property="article:author"]').attr('content') ||
    $('meta[property="og:author"]').attr('content');

  if (metaAuthor) return metaAuthor;

  // Try common author classes/elements
  const authorSelectors = [
    '.author',
    '.by-author',
    '.post-author',
    '[rel="author"]',
    '.article-author',
  ];

  for (const selector of authorSelectors) {
    const authorText = $(selector).first().text().trim();
    if (authorText) return authorText;
  }

  return null;
}

/**
 * Extract categories/tags from HTML
 */
export function extractCategories(html: string): string[] {
  const $ = cheerio.load(html);
  const categories: string[] = [];

  // Try meta keywords
  const metaKeywords = $('meta[name="keywords"]').attr('content');
  if (metaKeywords) {
    categories.push(...metaKeywords.split(',').map((k) => k.trim()));
  }

  // Try category links
  $('.category, .tag, [rel="category"]').each((_, el) => {
    const text = $(el).text().trim();
    if (text) categories.push(text);
  });

  // Deduplicate
  return [...new Set(categories)];
}

/**
 * Extract all links from HTML
 */
export function extractLinks(html: string, baseUrl?: string): string[] {
  const $ = cheerio.load(html);
  const links: string[] = [];

  $('a[href]').each((_, el) => {
    let href = $(el).attr('href');
    if (href) {
      // Make absolute if baseUrl provided
      if (baseUrl && !href.startsWith('http')) {
        try {
          href = new URL(href, baseUrl).toString();
        } catch (e) {
          // Invalid URL, skip
          return;
        }
      }
      links.push(href);
    }
  });

  return links;
}

/**
 * Detect if page is a list/index page
 */
export function isListPage(html: string): boolean {
  const $ = cheerio.load(html);

  // Check for common list indicators
  const listIndicators = [
    'article > a', // Article links
    '.post-list',
    '.article-list',
    '.news-list',
    'ul.posts',
  ];

  for (const selector of listIndicators) {
    if ($(selector).length > 3) {
      return true;
    }
  }

  return false;
}

/**
 * Extract article URLs from a list page
 */
export function extractArticleUrls(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);
  const urls: Set<string> = new Set();

  // Try to find article links
  const articleSelectors = [
    'article a[href]',
    '.post a[href]',
    '.article-title a[href]',
    '.entry-title a[href]',
    'h2 a[href]',
    'h3 a[href]',
  ];

  for (const selector of articleSelectors) {
    $(selector).each((_, el) => {
      let href = $(el).attr('href');
      if (href) {
        try {
          const absoluteUrl = new URL(href, baseUrl).toString();
          urls.add(absoluteUrl);
        } catch (e) {
          // Invalid URL, skip
        }
      }
    });
  }

  return Array.from(urls);
}
