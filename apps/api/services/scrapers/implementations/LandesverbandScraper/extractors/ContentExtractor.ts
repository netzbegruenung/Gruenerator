/**
 * Content Extractor
 * CMS-specific content extraction for WordPress and Neos
 * Static methods for easy testing
 */

import * as cheerio from 'cheerio';
import { type AnyNode } from 'domhandler';

import { normalizeGermanDate } from '../../../../documentMeta/germanDates.js';

import type { ExtractedContent } from '../types.js';

/**
 * Block-level Elemente, vor UND nach denen `blockText` einen Trenner einfügt.
 * Inline-Elemente (span, a, strong, em, small, …) sind absichtlich NICHT
 * dabei — ein Trenner dort würde Wörter auseinanderreißen ("Grü nen",
 * "inkl.MwSt" bei `<small>`). Der Foto-Credit-Fall (`<small>Foto: …</small>`
 * verklebt mit dem folgenden Datum) läuft über `removeSelectors`, nicht hier.
 */
const BLOCK_SEPARATOR_SELECTOR =
  'p, li, h1, h2, h3, h4, h5, h6, div, td, th, tr, blockquote, section, article, header, footer, figcaption, dt, dd';

interface ContentSelectors {
  title: string[];
  date: string[];
  content: string[];
  categories?: string[];
  /** Elements to strip from the whole page before content matching (#3574) */
  removeSelectors?: string[];
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
   * Text von `el` mit einem Trenner vor UND nach jedem Block-Element und nach
   * `<br>`. cheerio klebt beim reinen `.text()` sonst benachbarte Blöcke ohne
   * Trennzeichen zusammen ("prüfenDas", "ausDer", "IntroPara", #3573). Läuft
   * pro Element aus `el` einzeln und fügt die Ergebnisse mit `\n\n` zusammen —
   * derselbe Absatztrenner wie an einer berührenden Blockgrenze innerhalb
   * eines Wurzelelements (einheitlich, nicht ein Einzel- gegen ein
   * Doppel-`\n`). Matcht der Content-Selektor mehrere Geschwister-Wurzeln
   * (z. B. `.wp-block-paragraph` mit 2 Treffern), bräuchten die sonst
   * ebenfalls einen Trenner, aber cheerios `.before()`/`.after()` sind No-Ops
   * auf einem eigenständig geklonten (elternlosen) Wurzelknoten — verifiziert,
   * bevor hier auf `$clone.filter(SEL).add($clone.find(SEL))` gesetzt wurde:
   * das ändert am geklonten Text nichts, weil die Wurzel keinen Parent hat, an
   * dem ein Geschwisterknoten hängen könnte.
   *
   * Arbeitet je Wurzel auf einem Klon — mutiert nie das geteilte Dokument,
   * das spätere Selektoren (Datum, Kategorien) im selben Aufruf noch lesen.
   */
  static blockText($: cheerio.CheerioAPI, el: cheerio.Cheerio<AnyNode>): string {
    return el
      .map((_, node) => {
        const $clone = $(node).clone();
        // HTML kollabiert jede Whitespace-Folge (auch Zeilenumbrüche aus der
        // Quelltext-Einrückung) zu einem Leerzeichen. Das muss VOR dem
        // Einfügen unserer eigenen Trenner passieren, sonst hinge `full_text`
        // (und `content_hash`) von der Einrückung des Templates ab.
        $clone
          .find('*')
          .addBack()
          .contents()
          .each((_, contentNode) => {
            if (contentNode.type === 'text') {
              contentNode.data = contentNode.data.replace(/\s+/g, ' ');
            }
          });
        $clone.find('br').replaceWith('\n');
        const blocks = $clone.find(BLOCK_SEPARATOR_SELECTOR);
        blocks.before('\n');
        blocks.after('\n');
        return $clone.text();
      })
      .get()
      .join('\n\n');
  }

  /**
   * Whitespace-Normalisierung für extrahierten Text. Läuft zeilenweise, damit
   * die von `blockText` gesetzten Zeilenumbrüche (Absatzgrenzen) erhalten
   * bleiben — der Chunker (`smartChunkDocument` → `cleanTextForEmbedding(text,
   * true)`) erkennt Überschriften/Absätze zeilenweise, ein einzeiliger Text
   * würde ihm die Struktur nehmen. Reihenfolge ist wichtig: erst pro Zeile
   * Whitespace kollabieren, DANN 3+ Zeilenumbrüche zusammenziehen — umgekehrt
   * (wie zuvor) frisst `/\s+/g` die Zeilenumbrüche schon vorher weg und macht
   * die Zeilenumbruch-Regel zu totem Code.
   *
   * `[^\S\n]` trifft jedes Whitespace-Zeichen außer `\n` — also Tab, Formfeed,
   * Vertical-Tab, NBSP, die Unicode-Leerräume U+2000–U+200A/U+3000, nicht nur
   * das ASCII-Leerzeichen. Nötig bleibt der Schritt trotz der Kollabierung in
   * `blockText`, weil zwei für sich schon kollabierte Textknoten an einer
   * Grenze (z. B. Inline-Element-Rand) immer noch zwei Leerzeichen aneinander-
   * reihen können.
   */
  static normalizeWhitespace(text: string): string {
    return text
      .split('\n')
      .map((line) => line.replace(/[^\S\n]+/g, ' ').trim())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /**
   * Wählt den Content-Text — identisch in allen drei CMS-Extraktionsmethoden,
   * deshalb hier einmal statt dreimal dupliziert.
   *
   * Der 200-Zeichen-Schwellenwert wird auf dem UNGETRENNTEN Text gemessen
   * (`el.text()`), nicht auf dem mit `blockText` separator-versehenen — das
   * entspricht exakt dem in #3574 austarierten Selektor-Verhalten. Würde man
   * auf der getrennten Länge gaten, könnten die eingefügten Trenner einen
   * knapp unter 200 Zeichen liegenden Container (der z. B. zusätzlich eine
   * "Kategorie"/"Zurück"-Seitenleiste enthält) über die Schwelle heben und
   * genau die Seitenchrome hereinziehen, die der Schwellenwert ausschließen
   * soll.
   *
   * Fällt keiner der Selektoren durch die Schwelle, nimmt der Rückfall den
   * ERSTEN Selektor mit irgendeinem nicht-leeren Text (nicht den längsten, der
   * weiterhin Seitenchrome mitziehen kann) — erst wenn auch das leer bleibt,
   * main/body (#3574). `main`s Text wird getrimmt geprüft, nicht nur auf
   * Leerstring: ein `<main>` ohne echten Inhalt (nur verschachtelte leere
   * Blockelemente) kann nach `blockText` allein aus eingefügten
   * Zeilenumbrüchen bestehen — das ist kein Inhalt und muss auf `body`
   * zurückfallen.
   */
  static #extractContentText(
    $: cheerio.CheerioAPI,
    selectors: string[]
  ): { text: string; bodyFallback: boolean } {
    for (const sel of selectors) {
      const el = $(sel);
      if (el.length && el.text().trim().length > 200) {
        return { text: ContentExtractor.blockText($, el), bodyFallback: false };
      }
    }

    for (const sel of selectors) {
      const el = $(sel);
      if (el.length && el.text().trim()) {
        return { text: ContentExtractor.blockText($, el), bodyFallback: false };
      }
    }

    const main = $('main');
    const mainText = main.length ? ContentExtractor.blockText($, main) : '';
    const text = mainText.trim() ? mainText : ContentExtractor.blockText($, $('body'));
    return { text, bodyFallback: true };
  }

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
    // Per-source chrome (#3574)
    if (selectors.removeSelectors?.length) {
      $(selectors.removeSelectors.join(', ')).remove();
    }

    const picked = ContentExtractor.#extractContentText($, selectors.content);
    let contentText = picked.text;
    const bodyFallback = picked.bodyFallback;

    // Extract categories
    const categories: string[] = [];
    const catSelector = selectors.categories?.join(', ') || 'a[rel="category tag"]';
    $(catSelector).each((_, el) => {
      const cat = $(el).text().trim();
      if (cat && !categories.includes(cat)) {
        categories.push(cat);
      }
    });

    contentText = ContentExtractor.normalizeWhitespace(contentText);

    return { title, publishedAt, text: contentText, categories, bodyFallback };
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
    // Per-source chrome (#3574)
    if (selectors.removeSelectors?.length) {
      $(selectors.removeSelectors.join(', ')).remove();
    }

    const picked = ContentExtractor.#extractContentText($, selectors.content);
    let contentText = picked.text;
    const bodyFallback = picked.bodyFallback;

    // Extract categories
    const categories: string[] = [];
    const catSelector = selectors.categories?.join(', ') || 'a[href*="/themen/"]';
    $(catSelector).each((_, el) => {
      const cat = $(el).text().trim();
      if (cat && !categories.includes(cat)) {
        categories.push(cat);
      }
    });

    contentText = ContentExtractor.normalizeWhitespace(contentText);

    return { title, publishedAt, text: contentText, categories, bodyFallback };
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
        const candidate = el.attr('datetime') || el.attr('content') || el.text().trim();
        // A selector's text only wins if it actually looks like a date — the
        // first match for some sources is a teaser/prose paragraph, not the
        // date itself (#3565). Otherwise fall through to the next selector.
        if (candidate && ContentExtractor.looksLikeDate(candidate)) {
          publishedAt = candidate;
          break;
        }
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
    // Per-source chrome (#3574)
    if (selectors.removeSelectors?.length) {
      $(selectors.removeSelectors.join(', ')).remove();
    }

    const picked = ContentExtractor.#extractContentText($, selectors.content);
    let contentText = picked.text;
    const bodyFallback = picked.bodyFallback;

    // Extract categories
    const categories: string[] = [];
    const catSelector = selectors.categories?.join(', ') || '.tags a';
    $(catSelector).each((_, el) => {
      const cat = $(el).text().trim();
      if (cat && !categories.includes(cat)) {
        categories.push(cat);
      }
    });

    contentText = ContentExtractor.normalizeWhitespace(contentText);

    return { title, publishedAt, text: contentText, categories, bodyFallback };
  }

  /**
   * Whether `text` STARTS WITH a date (ISO, DD.MM.YY(YY), or a German
   * long-form month name — optional trailing text like " –" is fine) — used to
   * skip a date selector whose first match is prose that merely CONTAINS a
   * date ("am Donnerstag, 2. März 2023", "Sitzung vom 12.03.2019") rather than
   * being the date itself (#3565). Anchored at the start: an unanchored check
   * would let `normalizeGermanDate` pull an embedded date out of that prose.
   */
  private static looksLikeDate(text: string): boolean {
    const trimmed = text.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return true;
    return /^\d{1,2}\.\s*(?:\d{1,2}\.\d{2,4}|(?:Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+\d{4})(?!\d)/i.test(
      trimmed
    );
  }

  /**
   * Normalize German date formats (DD.MM.YY or DD.MM.YYYY) to ISO (YYYY-MM-DD).
   * Passes through already-ISO strings unchanged.
   */
  static normalizeGermanDate(dateStr: string): string {
    return normalizeGermanDate(dateStr);
  }

  /**
   * Titel landen in Chat-Listen, Zitaten, `titleContains` und der Sortierung.
   * Manche CMS maskieren `&nbsp;` doppelt (cheerio dekodiert nur einmal, übrig
   * bleibt das Literal) oder brechen den Titel um (gruene.berlin, #3560).
   */
  static normalizeTitle(title: string): string {
    return title
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
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

    extracted.title = ContentExtractor.normalizeTitle(extracted.title);
    return extracted;
  }
}
