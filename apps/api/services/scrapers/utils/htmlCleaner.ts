/**
 * HTML cleaning utilities
 * Functions for cleaning and normalizing HTML content
 */

import * as cheerio from 'cheerio';

/**
 * Remove unwanted elements from HTML
 */
export function removeUnwantedElements(
  $: cheerio.CheerioAPI,
  selectors: string[] = [
    'script',
    'style',
    'iframe',
    'noscript',
    'nav',
    '.cookie-banner',
    '.advertisement',
    '#comments',
  ]
): void {
  selectors.forEach(selector => $(selector).remove());
}

/**
 * Clean text content (normalize whitespace, remove special characters)
 */
export function cleanText(text: string): string {
  return text
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/\u00A0/g, ' ') // Replace non-breaking spaces
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // Remove zero-width spaces
    .trim();
}

/**
 * Extract clean text from HTML
 */
export function extractCleanText(html: string, removeSelectors?: string[]): string {
  const $ = cheerio.load(html);

  if (removeSelectors) {
    removeUnwantedElements($, removeSelectors);
  } else {
    removeUnwantedElements($);
  }

  return cleanText($('body').text());
}

/**
 * Remove TYPO3 search markers
 */
export function removeTypo3Markers(text: string): string {
  return text
    .replace(/###TYPO3SEARCH_begin###/g, '')
    .replace(/###TYPO3SEARCH_end###/g, '');
}

/**
 * Clean wiki markup (MediaWiki specific)
 */
export function cleanWikiMarkup(text: string): string {
  return text
    .replace(/\[\[Category:.*?\]\]/g, '') // Remove category links
    .replace(/\[\[File:.*?\]\]/g, '') // Remove file links
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2') // [[link|text]] -> text
    .replace(/\[\[([^\]]+)\]\]/g, '$1') // [[link]] -> link
    .replace(/'{2,5}/g, '') // Remove wiki bold/italic markup
    .replace(/<ref[^>]*>.*?<\/ref>/g, '') // Remove reference tags
    .replace(/<ref[^>]*\/>/g, '') // Remove self-closing reference tags
    .trim();
}

/**
 * Strip HTML tags completely
 */
export function stripHtmlTags(html: string): string {
  const $ = cheerio.load(html);
  return cleanText($.text());
}

/**
 * Extract meta description from HTML
 */
export function extractMetaDescription(html: string): string | null {
  const $ = cheerio.load(html);
  return $('meta[name="description"]').attr('content') ||
         $('meta[property="og:description"]').attr('content') ||
         null;
}

/**
 * Extract title from HTML
 */
export function extractTitle(html: string): string | null {
  const $ = cheerio.load(html);
  return $('title').text().trim() ||
         $('meta[property="og:title"]').attr('content') ||
         $('h1').first().text().trim() ||
         null;
}

/**
 * Clean and normalize URLs in content
 */
export function normalizeContentUrls($: cheerio.CheerioAPI, baseUrl: string): void {
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (href && !href.startsWith('http')) {
      try {
        const absoluteUrl = new URL(href, baseUrl).toString();
        $(el).attr('href', absoluteUrl);
      } catch (e) {
        // Invalid URL, leave as is
      }
    }
  });
}
