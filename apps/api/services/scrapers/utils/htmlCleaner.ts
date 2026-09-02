/**
 * HTML cleaning utilities
 * Functions for cleaning and normalizing HTML content
 */

import * as cheerio from 'cheerio';
import { type Element } from 'domhandler';

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
  selectors.forEach((selector) => $(selector).remove());
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
 * HTML-Sonderzeichen maskieren, bevor Text per `replaceWith` zurück in den Baum
 * geht. `replaceWith` PARST seinen String als HTML — `$(el).text()` hat
 * `&lt;b&gt;` vorher zu `<b>` dekodiert, und ohne diese Maskierung würde daraus
 * beim Wiedereinsetzen ein Tag und der Text verschwände. Das abschliessende
 * `$.text()` dekodiert wieder.
 */
function escapeForTextNode(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Wie `cleanText`, aber `\n` ist unantastbar: nur `[ \t]` wird zusammengezogen,
 * `\n{3,}` fällt auf `\n\n`. Der Unterschied ist die ganze Sache — `segmentBlocks`
 * (`document-services/TextChunker/blockSegmentation.ts:143`) arbeitet zeilenweise,
 * und ohne `\n` gibt es genau einen Block (#3163).
 */
export function normalizeStructuredText(text: string): string {
  if (!text) return '';

  return text
    .replace(/\u00A0/g, ' ') // Geschütztes Leerzeichen
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // Nullbreiten-Zeichen
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/[ ]*\n[ ]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Blockgrenzen erhalten: h1–h6 → `#`-Zeile, p → Absatz, br → Zeile, li → Zeile.
 *
 * Der Körper stammt aus `WebsiteCrawler#htmlToMarkdown` (dort mit diesem PR
 * gestrichen), mit vier Abweichungen: der Abschluss ist `normalizeStructuredText`
 * statt eines `\s+`-Kollapses; `<br>` wird zu `\n`; `strong`/`em` bekommen KEINE
 * `**`/`*` (die Sternchen landeten sonst über `chunk_text` in der Einbettung);
 * und eingesetzter Text wird maskiert, siehe `escapeForTextNode`.
 *
 * Für Titel und Beschreibung bleibt `cleanText` richtig — nur Fließtext darf
 * nicht durch den Kollaps.
 */
export function htmlToStructuredText(html: string): string {
  if (!html) return '';

  const $ = cheerio.load(html);

  $('br').each((_, el) => {
    $(el).replaceWith(escapeForTextNode('\n'));
  });

  $('h1, h2, h3, h4, h5, h6').each((_, el) => {
    const level = Number.parseInt((el as Element).tagName.charAt(1), 10);
    $(el).replaceWith(escapeForTextNode(`${'#'.repeat(level)} ${$(el).text().trim()}\n\n`));
  });

  $('p').each((_, el) => {
    $(el).replaceWith(escapeForTextNode(`${$(el).text()}\n\n`));
  });

  $('ul, ol').each((_, el) => {
    const isOrdered = (el as Element).tagName.toLowerCase() === 'ol';
    $(el)
      .find('li')
      .each((i, li) => {
        // `1) ` statt `1. `: `NUMBERED_HEADING` (blockSegmentation.ts) liest ein
        // `1. `-Präfix vor einem kurzen, grossgeschriebenen Wort als Überschrift
        // und würde so einen echten heading_path unter einem Listenpunkt begraben.
        const prefix = isOrdered ? `${i + 1}) ` : '- ';
        $(li).replaceWith(escapeForTextNode(`${prefix}${$(li).text()}\n`));
      });
  });

  return normalizeStructuredText($.text());
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
  return text.replace(/###TYPO3SEARCH_begin###/g, '').replace(/###TYPO3SEARCH_end###/g, '');
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
  return (
    $('meta[name="description"]').attr('content') ||
    $('meta[property="og:description"]').attr('content') ||
    null
  );
}

/**
 * Extract title from HTML
 */
export function extractTitle(html: string): string | null {
  const $ = cheerio.load(html);
  return (
    $('title').text().trim() ||
    $('meta[property="og:title"]').attr('content') ||
    $('h1').first().text().trim() ||
    null
  );
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
      } catch {
        // Invalid URL, leave as is
      }
    }
  });
}
