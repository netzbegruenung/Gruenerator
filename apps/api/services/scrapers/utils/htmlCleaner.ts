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
    const title = $(el).text().trim();
    // Eine leere Überschrift darf keine nackte `##`-Zeile hinterlassen —
    // `parseHeading` lehnt sie ohnehin ab, sie würde nur als Fließtext landen.
    if (!title) {
      $(el).replaceWith('');
      return;
    }
    const level = Number.parseInt((el as Element).tagName.charAt(1), 10);
    $(el).replaceWith(escapeForTextNode(`${'#'.repeat(level)} ${title}\n\n`));
  });

  $('p').each((_, el) => {
    $(el).replaceWith(escapeForTextNode(`${$(el).text()}\n\n`));
  });

  // Listen rekursiv von aussen nach innen: je Punkt erst die verschachtelten
  // Listen herauslösen und für sich rendern, dann den EIGENEN Text des Punkts
  // nehmen. So bekommt ein Punkt sein Präfix nur vor seinem eigenen Text, und
  // ein Punkt, der mit einer Unterliste BEGINNT (`<li><ul>…</ul>Text</li>`),
  // verliert weder sein Präfix noch trennt sein Resttext in die Zeile darüber
  // (die frühere Variante liess das führende `\n` der ersetzten Unterliste
  // stehen, und `normalizeStructuredText` frass dann das Leerzeichen hinter
  // dem `-`). `.children('li')` nimmt nur die direkten Punkte dieser Liste;
  // `.find('li')` sammelte auch die Punkte verschachtelter Listen ein.
  const renderList = (list: Element): string[] => {
    const isOrdered = list.tagName.toLowerCase() === 'ol';
    const lines: string[] = [];
    $(list)
      .children('li')
      .each((i, li) => {
        const nested = $(li)
          .children('ul, ol')
          .get()
          .flatMap((inner) => {
            const rendered = renderList(inner as Element);
            // Ein Leerzeichen statt `.remove()`: sonst rücken die Textknoten
            // links und rechts der Unterliste aneinander ("A<ul>…</ul>B" → "AB").
            $(inner).replaceWith(' ');
            return rendered;
          });
        // `1) ` statt `1. `: `NUMBERED_HEADING` (blockSegmentation.ts) liest ein
        // `1. `-Präfix vor einem kurzen, grossgeschriebenen Wort als Überschrift
        // und würde so einen echten heading_path unter einem Listenpunkt begraben.
        const prefix = isOrdered ? `${i + 1}) ` : '- ';
        const own = $(li).text().replace(/\s+/g, ' ').trim();
        if (own.length > 0) {
          lines.push(`${prefix}${own}`);
        }
        lines.push(...nested);
      });
    return lines;
  };

  $('ul, ol')
    .filter((_, list) => $(list).parents('ul, ol').length === 0)
    .each((_, list) => {
      // Führendes `\n` trennt vom vorangehenden Inline-Text, abschliessendes
      // `\n` vom folgenden Geschwister-Knoten.
      $(list).replaceWith(escapeForTextNode(`\n${renderList(list as Element).join('\n')}\n`));
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
