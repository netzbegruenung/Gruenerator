/**
 * Volltext eines Gegenstands (Antrag, Regierungsvorlage, Anfrage) aus dem
 * HTML, das das Parlament neben dem PDF ausliefert — ein Word-Export.
 *
 * Überschriften sind dort keine `h1`–`h3`, sondern Absätze mit sprechenden
 * Formatvorlagen (`81ErlUeberschrZ`, `82ErlUeberschrL`, `ÜberschriftZ` …).
 * Sie werden zu Überschriften, damit der Chunker an ihnen schneidet und ihren
 * Pfad mitführt; der Rest läuft durch `htmlToStructuredText`, die eine Tür für
 * Fließtext (`fulltextStructure.vitest.ts`).
 */
import * as cheerio from 'cheerio';

import { collapseTextNodeWhitespace, htmlToStructuredText } from '../../utils/htmlCleaner.js';

const HEADING_CLASS = /ueberschr|berschrift/i;
// „… wurde elektronisch übermittelt." bzw. „… ist elektronisch textinterpretiert."
const TRANSMISSION_NOTE =
  /^Dieser Text (?:wurde|ist) elektronisch [^.\n]*\. Abweichungen vom Original sind möglich\.$/gm;
const MAX_HEADING_CHARS = 200;

export function gegenstandText(html: string): string {
  const $ = cheerio.load(html);
  $('head, style, script').remove();
  collapseTextNodeWhitespace($);
  $('p[class]').each((_, el) => {
    const text = $(el).text().trim();
    if (!HEADING_CLASS.test($(el).attr('class') ?? '') || text.length > MAX_HEADING_CHARS) return;
    $(el).replaceWith($('<h2>').text(text));
  });
  return htmlToStructuredText($('body').html() ?? '')
    .replace(/\u00AD/g, '')
    .replace(TRANSMISSION_NOTE, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
