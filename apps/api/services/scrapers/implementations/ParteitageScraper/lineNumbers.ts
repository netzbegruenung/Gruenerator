/**
 * Zeilennummern eines Antrags. Die REST-API liefert sie nicht; die HTML-Seite
 * zeigt sie (`span.lineNumber[data-line-number]`), Absatz für Absatz
 * (`div.paragraph.lineNumbers`). Änderungsanträge verweisen auf genau diese
 * Zeilen („Von Zeile 2 bis 7"), und eine Antwort soll eine Stelle so zitieren
 * können, wie sie auf dem Parteitag genannt wird.
 *
 * Der Text bleibt der API-Text: die Seitenfassung wird nur genommen, wenn sie
 * ohne Marken Zeichen für Zeichen (Buchstaben und Ziffern) dem API-Abschnitt
 * gleicht (`withLineNumbers`). Sonst gilt die API, ohne Zeilen.
 */
import * as cheerio from 'cheerio';

import { htmlToStructuredText } from '../../utils/htmlCleaner.js';

import type { AnyNode, Element } from 'domhandler';

export interface NumberedParagraph {
  from: number;
  to: number;
  /** Strukturierter Text wie aus `htmlToStructuredText`. */
  text: string;
}

export interface NumberedSection {
  title: string;
  paragraphs: NumberedParagraph[];
}

const isTag = (node: AnyNode | null, name: string): boolean =>
  node != null && node.type === 'tag' && (node as Element).name === name;

/** Alle Abschnitte der Seite, die Zeilennummern tragen. */
export function numberedSectionsOf(pageHtml: string): NumberedSection[] {
  const $ = cheerio.load(pageHtml);
  const sections: NumberedSection[] = [];
  $('section.motionTextHolder').each((_, sec) => {
    const paragraphs: NumberedParagraph[] = [];
    $(sec)
      .find('div.paragraph.lineNumbers')
      .each((__, p) => {
        const text = $(p).find('div.text').first().clone();
        // Bedienelemente der Seite, kein Antragstext.
        text.find('section.privateParagraphNoteHolder, ul.bookmarks, button').remove();
        const numbers: number[] = [];
        text.find('span.lineNumber').each((___, span) => {
          const n = Number($(span).attr('data-line-number'));
          if (Number.isFinite(n)) numbers.push(n);
          // Der Umbruch vor einer Zeilenmarke ist der weiche Zeilenumbruch der
          // Anzeige, kein Absatz im Text.
          if (isTag(span.prev, 'br')) $(span.prev!).remove();
          $(span).remove();
        });
        const structured = htmlToStructuredText(text.html() ?? '').trim();
        if (numbers.length === 0 || !structured) return;
        paragraphs.push({ from: Math.min(...numbers), to: Math.max(...numbers), text: structured });
      });
    if (paragraphs.length > 0) {
      sections.push({ title: $(sec).find('h2').first().text().trim(), paragraphs });
    }
  });
  return sections;
}

/** Nur Buchstaben und Ziffern — Umbrüche, Leerzeichen und Satzzeichen der Darstellung zählen nicht. */
export function fingerprint(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

export function lineLabel(p: Pick<NumberedParagraph, 'from' | 'to'>): string {
  return p.from === p.to ? `[Z. ${p.from}]` : `[Z. ${p.from}–${p.to}]`;
}

function marked(p: NumberedParagraph): string {
  // Eine Überschrift bleibt Überschrift: eine Marke davor nähme ihr das `#`
  // am Zeilenanfang und damit den Platz im Überschriftenpfad der Chunks.
  if (p.text.startsWith('#')) return p.text;
  // Listen und mehrzeilige Absätze: die Marke auf eigener Zeile, damit `- ` am Zeilenanfang bleibt.
  if (/^(?:[-*] |\d+\. )/.test(p.text)) return `${lineLabel(p)}\n${p.text}`;
  return `${lineLabel(p)} ${p.text}`;
}

/**
 * Der API-Abschnitt mit Zeilenmarken je Absatz — oder `null`, wenn kein
 * Seitenabschnitt denselben Text trägt (andere Fassung, geänderte Seite).
 */
export function withLineNumbers(
  apiHtml: string,
  numbered: readonly NumberedSection[]
): string | null {
  const want = fingerprint(htmlToStructuredText(apiHtml));
  if (!want) return null;
  const hit = numbered.find(
    (s) => fingerprint(s.paragraphs.map((p) => p.text).join('\n')) === want
  );
  return hit ? hit.paragraphs.map(marked).join('\n\n') : null;
}
