// SPDX-License-Identifier: MPL-2.0

/**
 * Auszeichnung und Listen über den GANZEN Text — ohne Editor.
 *
 * Wer einen Text nur auswählt, öffnet keinen Editor, und die Knöpfe für Fett,
 * Kursiv, Akzent, Marker und Listen gelten dann für alles. Das hier ist ihr
 * Modell: Funktionen auf dem gespeicherten Feldtext (`inlineMarks.ts`,
 * `listLayout.ts`), DOM-frei und ohne tiptap, damit sie in Node testbar sind
 * und die Kopfleiste kein Stück vom Editor nachladen muss.
 *
 * Die Form ist dieselbe, die das Schließen des Editors schreibt
 * (`richTextToMarkdownLite`): Aufzählung als `•`, Nummerierung als `1.`, Marker
 * in kanonischer Schreibweise. Ein Text, der hier angefasst wird und einer, der
 * im Editor bearbeitet wird, unterscheiden sich danach nicht.
 */

import {
  parseInlineMarks,
  serializeInlineMarks,
  type InlineRun,
  type RunStyle,
} from './inlineMarks.js';
import { LIST_BULLET, isOrderedMarker, splitListItems } from './listLayout.js';

export type WholeTextMark = 'bold' | 'italic' | 'underline' | 'accent' | 'marker';
export type WholeTextList = 'bullet' | 'ordered';

/** Was der ganze Text trägt — die Form, die die Knöpfe des Editors aus tiptap lesen. */
export interface WholeTextFormat {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  accent: boolean;
  /** Die eine Farbe, in der der ganze Akzent steht; `null` bei der Farbe der Vorlage oder bei mehreren. */
  accentColor: string | null;
  marker: boolean;
  markerColor: string | null;
  bulletList: boolean;
  orderedList: boolean;
}

const HEX6 = /^#[0-9a-f]{6}$/i;

/** Eine Zeile samt dem, was `splitListItems` über sie weiß. */
interface Line {
  raw: string;
  /** Marker eines Listenpunkts (`•`, `2.`), sonst `null`. */
  marker: string | null;
  /** Der Text, an dem Auszeichnung hängt: bei einem Punkt ohne Marker, sonst die Zeile selbst. */
  body: string;
  blank: boolean;
}

function readLines(text: string): Line[] {
  const items = splitListItems(text);
  return text.split('\n').map((raw, i) => {
    const item = items[i]!;
    return {
      raw,
      marker: item.marker,
      body: item.marker === null ? raw : item.body,
      blank: raw.trim() === '',
    };
  });
}

function withMark(
  run: InlineRun,
  mark: WholeTextMark,
  on: boolean,
  color: string | null
): InlineRun {
  const next: InlineRun = { ...run };
  next[mark] = on;
  if (mark === 'accent') {
    delete next.accentColor;
    if (on && color) next.accentColor = color;
  } else if (mark === 'marker') {
    delete next.markerColor;
    if (on && color) next.markerColor = color;
  }
  return next;
}

/**
 * Setzt (`on`) oder nimmt (`!on`) eine Auszeichnung über den ganzen Text. Bei
 * Akzent und Marker gibt `color` (`#RRGGBB`) den Lauf eine eigene Farbe; ohne
 * sie gilt die der Vorlage. Der Marker eines Listenpunkts bleibt vor der
 * Auszeichnung stehen, Leerzeilen bleiben leer.
 */
export function setWholeTextMark(
  text: string,
  mark: WholeTextMark,
  on: boolean,
  color: string | null = null
): string {
  const own = color && HEX6.test(color) ? color.toUpperCase() : null;
  return readLines(text)
    .map((line) => {
      if (line.blank) return line.raw;
      const body = serializeInlineMarks(
        parseInlineMarks(line.body).map((run) => withMark(run, mark, on, own))
      );
      return line.marker === null ? body : `${line.marker} ${body}`;
    })
    .join('\n');
}

/**
 * Setzt jede nicht leere Zeile in die Liste (`null`: aus der Liste). Eine
 * Nummerierung zählt je Block neu; sie braucht mindestens zwei Zeilen
 * (`wholeTextCanOrderedList`) und lässt den Text sonst, wie er ist.
 */
export function setWholeTextList(text: string, list: WholeTextList | null): string {
  if (list === 'ordered' && !wholeTextCanOrderedList(text)) return text;
  let number = 0;
  return readLines(text)
    .map((line) => {
      if (line.blank) {
        number = 0;
        return line.raw;
      }
      const body = line.marker === null ? line.raw.trim() : line.body;
      if (list === null) return body;
      if (list === 'bullet') return `${LIST_BULLET} ${body}`;
      number += 1;
      return `${number}. ${body}`;
    })
    .join('\n');
}

/**
 * Gilt eine Nummerierung für diesen Text? Eine Ziffer zählt als Marker erst, wenn
 * mindestens zwei Zeilen eine tragen (`splitListItems`): „1. Mai Demo“ ist ein
 * Datum. Eine einzelne nummerierte Zeile fiele beim nächsten Lesen also zurück.
 */
export function wholeTextCanOrderedList(text: string): boolean {
  return text.split('\n').filter((line) => line.trim() !== '').length >= 2;
}

/** Die eine Farbe, die alle Läufe tragen — sonst `null`. */
function sharedColor(runs: InlineRun[], field: 'accentColor' | 'markerColor'): string | null {
  const colors = new Set(runs.map((run) => run[field] ?? null));
  return colors.size === 1 ? ([...colors][0] ?? null) : null;
}

/**
 * Was der ganze Text trägt. Eine Auszeichnung gilt als gesetzt, wenn jeder Lauf
 * mit sichtbarem Text sie trägt; das Leerzeichen zwischen zwei ausgezeichneten
 * Wörtern zählt nicht (der Serialisierer zeichnet Leerraum nie aus).
 */
export function wholeTextFormat(text: string): WholeTextFormat {
  const lines = readLines(text);
  const runs = lines
    .filter((line) => !line.blank)
    .flatMap((line) => parseInlineMarks(line.body))
    .filter((run) => run.text.trim() !== '');
  const carries = (key: keyof RunStyle & WholeTextMark) =>
    runs.length > 0 && runs.every((run) => run[key]);

  const accent = carries('accent');
  const marker = carries('marker');

  const items = lines.filter((line) => !line.blank);
  const everyItem = items.length > 0 && items.every((line) => line.marker !== null);
  const ordered = everyItem && items.every((line) => isOrderedMarker(line.marker!));
  const bullet = everyItem && items.every((line) => !isOrderedMarker(line.marker!));

  return {
    bold: carries('bold'),
    italic: carries('italic'),
    underline: carries('underline'),
    accent,
    accentColor: accent ? sharedColor(runs, 'accentColor') : null,
    marker,
    markerColor: marker ? sharedColor(runs, 'markerColor') : null,
    bulletList: bullet,
    orderedList: ordered,
  };
}
