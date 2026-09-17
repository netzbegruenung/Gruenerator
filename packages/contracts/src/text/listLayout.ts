/**
 * Canvas-Textlayout — geteilt, DOM-frei, Client + Server.
 *
 * Ein Sharepic-Textfeld ist ein flacher String; eine Aufzählung ist darin
 * nichts als Text, dessen Zeilen mit einem Marker beginnen, und Fett/Kursiv/
 * Unterstrichen stehen als Markdown-lite darin (`inlineMarks.ts`). Es gibt
 * bewusst kein Listen- und kein Rich-Text-Modell im Zustand und keins im
 * Contract (`canvasTemplateDescriptors` adressiert Textfelder als Strings,
 * und Contract-Feldnamen sind eingefroren).
 *
 * Dieses Modul ist die EINZIGE Stelle, die entscheidet, was eine Markerzeile
 * ist, wo umgebrochen wird und wie weit eine Fortsetzungszeile eingerückt
 * steht. Vorher brachte jede Renderdatei ihr eigenes `wrapText` mit — zehn
 * Kopien, alle mit demselben Fehler: sie brachen nur an `' '`, nie an `'\n'`.
 * Im Client meldete das zu wenige Zeilen, sodass die Auto-Fit-Schleifen der
 * Vorlagen nicht verkleinerten; auf dem Server blieb das `\n` in der „Zeile"
 * stehen und `fillText` ignorierte es, sodass alle Punkte übereinander lagen.
 *
 * Gemessen wird über einen hereingereichten Callback, nie über ein Canvas aus
 * diesem Modul: im Browser misst `document.createElement('canvas')`, auf dem
 * Server der node-canvas `ctx`. Das hält das Modul DOM-frei und in Node
 * testbar — und Vorschau und Export brechen endlich an derselben Stelle um.
 *
 * Umgebrochen wird wortweise mit dem Stil je Wort: ein fettes Wort ist
 * breiter als dasselbe Wort regular, und wer das beim Messen übergeht, bricht
 * an anderer Stelle um als der Renderer, der es dann zeichnet.
 */

import { PLAIN_STYLE, parseInlineMarks, type InlineRun, type RunStyle } from './inlineMarks.js';

/** Misst die Breite von `text` in px unter der aktuell gesetzten Schrift. */
export type MeasureText = (text: string) => number;

/** Misst `text` in px im gegebenen Stil (Fett/Kursiv ändern die Breite). */
export type MeasureRun = (text: string, style: RunStyle) => number;

/** Das Zeichen, auf das alle Strich-Marker vereinheitlicht werden. */
export const LIST_BULLET = '•';

export interface ListItem {
  /** Marker ohne Abstand (`•`, `2.`) — `null` für eine gewöhnliche Zeile. */
  marker: string | null;
  /** Zeileninhalt ohne Marker. */
  body: string;
}

export interface LayoutedLine {
  /** Der Text dieser Zeile, ohne Marker und ohne Auszeichnungsmarker. */
  text: string;
  /** Abstand vom linken Rand des Blocks in px (hängender Einzug). */
  indent: number;
  /** Nur auf der ERSTEN Zeile eines Punktes gesetzt; steht am Blockrand. */
  marker: string | null;
}

/** Ein Lauf mit seiner Position innerhalb der Zeile, relativ zum Einzug. */
export interface PositionedRun extends InlineRun {
  x: number;
}

export interface RichLayoutedLine {
  runs: PositionedRun[];
  indent: number;
  marker: string | null;
}

/** Zeichen, die als Aufzählungsmarker gelten. */
const BULLET_MARKERS = new Set(['-', '*', '–', '•']);

/** Die davon, die auf `•` vereinheitlicht werden — `•` ist schon am Ziel. */
const DASH_MARKERS = new Set(['-', '*', '–']);

const isSpace = (char: string): boolean => char === ' ' || char === '\t';

const isNumericMarker = (marker: string): boolean => {
  const code = marker.charCodeAt(0);
  return code >= 48 && code <= 57;
};

interface ParsedLine {
  /** Index hinter dem führenden Leerraum. */
  indentEnd: number;
  /** Der Marker ohne Abstand, z. B. `•` oder `2.`. */
  marker: string;
  /** Index, an dem der Text nach dem Marker beginnt. */
  bodyStart: number;
}

/**
 * Zerlegt EINE Zeile in Einzug, Marker und Rest — von Hand statt mit einem
 * Regex.
 *
 * Der naheliegende Ausdruck `^[ \t]*(marker)[ \t]+(.*)$` hat zwei Quantifier
 * über Leerraum und dahinter ein `.`, das Leerraum ebenfalls frisst. Über
 * langen Tab-Ketten kann der Backtracker dieselbe Zeile auf viele Arten
 * aufteilen; CodeQL meldet das als `js/polynomial-redos`, und der Eingabetext
 * kommt hier aus Nutzereingaben und Modellausgaben, ist also fremdbestimmt.
 * Ein einzelner linearer Durchlauf hat das Problem bauartbedingt nicht.
 */
function parseLine(line: string): ParsedLine | null {
  let i = 0;
  while (i < line.length && isSpace(line[i]!)) i++;
  const indentEnd = i;
  if (i >= line.length) return null;

  let marker: string;
  if (BULLET_MARKERS.has(line[i]!)) {
    marker = line[i]!;
    i += 1;
  } else {
    // Höchstens drei Ziffern, dann `.` oder `)` — wie `\d{1,3}[.)]`, nur ohne
    // Rücksetzen: mehr als drei Ziffern ist ohnehin kein Aufzählungspunkt.
    let digits = 0;
    while (digits < 3 && isNumericMarker(line[i + digits] ?? '')) digits++;
    if (digits === 0) return null;
    const punctuation = line[i + digits];
    if (punctuation !== '.' && punctuation !== ')') return null;
    marker = line.slice(i, i + digits + 1);
    i += digits + 1;
  }

  // Hinter dem Marker MUSS Leerraum stehen: „2.5 Prozent" ist eine Zahl.
  if (i >= line.length || !isSpace(line[i]!)) return null;
  while (i < line.length && isSpace(line[i]!)) i++;
  return { indentEnd, marker, bodyStart: i };
}

/**
 * `- Punkt` / `* Punkt` / `– Punkt` → `• Punkt`, zeilenweise.
 * Nummerierte Punkte bleiben unangetastet — ihre Reihenfolge ist Information.
 */
export function normalizeListMarkers(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      const parsed = parseLine(line);
      if (!parsed || !DASH_MARKERS.has(parsed.marker)) return line;
      return `${line.slice(0, parsed.indentEnd)}${LIST_BULLET} ${line.slice(parsed.bodyStart)}`;
    })
    .join('\n');
}

/**
 * Zerlegt einen Block in seine Zeilen und trennt den Marker ab.
 *
 * Eine Ziffer zählt erst als Marker, wenn MINDESTENS ZWEI Zeilen des Blocks
 * eine tragen: „1. Mai Demo" ist ein Datum, keine Aufzählung, und würde sonst
 * als Punkt eingerückt. Bullet-Zeichen brauchen diese Rückversicherung nicht —
 * niemand beginnt einen Satz mit „• ".
 */
export function splitListItems(text: string): ListItem[] {
  const lines = text.split('\n');
  const parsed = lines.map(parseLine);
  const numericCount = parsed.filter((p) => p !== null && isNumericMarker(p.marker)).length;
  const acceptNumeric = numericCount >= 2;

  return lines.map((line, i) => {
    const p = parsed[i];
    if (!p || (isNumericMarker(p.marker) && !acceptNumeric)) {
      return { marker: null, body: line.trim() };
    }
    return { marker: p.marker, body: line.slice(p.bodyStart).trim() };
  });
}

/** Trägt der Block mindestens eine als Marker gewertete Zeile? */
export function hasListMarkers(text: string): boolean {
  return splitListItems(text).some((item) => item.marker !== null);
}

/** Ist ein Marker eine Ziffer (`2.`) und keine Aufzählungskugel? */
export function isOrderedMarker(marker: string): boolean {
  return isNumericMarker(marker);
}

// ── Wortmaschine ────────────────────────────────────────────────────────────

/** Ein Wort besteht aus Fragmenten, weil ein Marker mitten im Wort stehen kann. */
type Word = InlineRun[];

const sameStyle = (a: RunStyle, b: RunStyle): boolean =>
  a.bold === b.bold && a.italic === b.italic && a.underline === b.underline;

const styleOf = (run: RunStyle): RunStyle => ({
  bold: run.bold,
  italic: run.italic,
  underline: run.underline,
});

/** Zerlegt Läufe an Leerzeichen in Wörter; leere Wörter erhalten Doppel-Leerzeichen. */
function splitWords(runs: InlineRun[]): Word[] {
  const words: Word[] = [[]];
  for (const run of runs) {
    run.text.split(' ').forEach((part, i) => {
      if (i > 0) words.push([]);
      if (part !== '') words[words.length - 1]!.push({ ...styleOf(run), text: part });
    });
  }
  return words;
}

const wordWidth = (word: Word, measure: MeasureRun): number =>
  word.reduce((sum, frag) => sum + measure(frag.text, frag), 0);

/** Stil, in dem das Leerzeichen HINTER diesem Wort gemessen wird. */
const trailingStyle = (word: Word, fallback: RunStyle): RunStyle =>
  word.length > 0 ? styleOf(word[word.length - 1]!) : fallback;

/**
 * Bricht ein Wort, das allein schon zu breit ist, INNERHALB des Wortes um.
 * Konva tut das von sich aus; weil wir die Zeilen vorberechnen und mit
 * `wrap="none"` setzen, greift sein Netz nicht mehr und wir brauchen unseres.
 */
function breakWord(word: Word, maxWidth: number, measure: MeasureRun): Word[] {
  const chunks: Word[] = [];
  let chunk: Word = [];
  let chunkWidth = 0;
  for (const frag of word) {
    for (const char of frag.text) {
      const charWidth = measure(char, frag);
      if (chunk.length > 0 && chunkWidth + charWidth > maxWidth) {
        chunks.push(chunk);
        chunk = [];
        chunkWidth = 0;
      }
      const last = chunk[chunk.length - 1];
      if (last && sameStyle(last, frag)) {
        last.text += char;
      } else {
        chunk.push({ ...styleOf(frag), text: char });
      }
      chunkWidth += charWidth;
    }
  }
  if (chunk.length > 0) chunks.push(chunk);
  return chunks.length > 0 ? chunks : [word];
}

/** Bricht EINE Zeile (ohne `\n`) an Wortgrenzen auf `maxWidth` um. */
function wrapRichSegment(runs: InlineRun[], maxWidth: number, measure: MeasureRun): Word[][] {
  const words = splitWords(runs);
  if (!Number.isFinite(maxWidth) || maxWidth <= 0) return [words];

  const lines: Word[][] = [];
  let current: Word[] = [];
  let currentWidth = 0;
  let spaceStyle: RunStyle = PLAIN_STYLE;

  for (const word of words) {
    const width = wordWidth(word, measure);

    if (current.length > 0 && currentWidth + measure(' ', spaceStyle) + width > maxWidth) {
      lines.push(current);
      current = [];
      currentWidth = 0;
    }

    if (width > maxWidth) {
      if (current.length > 0) {
        lines.push(current);
        current = [];
      }
      const chunks = breakWord(word, maxWidth, measure);
      for (const chunk of chunks.slice(0, -1)) lines.push([chunk]);
      const last = chunks[chunks.length - 1]!;
      current = [last];
      currentWidth = wordWidth(last, measure);
      spaceStyle = trailingStyle(last, spaceStyle);
      continue;
    }

    currentWidth += (current.length > 0 ? measure(' ', spaceStyle) : 0) + width;
    current.push(word);
    spaceStyle = trailingStyle(word, spaceStyle);
  }

  lines.push(current);
  return lines;
}

/** Setzt die Wörter einer Zeile hintereinander und liefert Läufe mit `x`. */
function positionLine(words: Word[], measure: MeasureRun): PositionedRun[] {
  const runs: PositionedRun[] = [];
  let x = 0;
  let spaceStyle: RunStyle = PLAIN_STYLE;
  const append = (text: string, style: RunStyle) => {
    const last = runs[runs.length - 1];
    if (last && sameStyle(last, style)) {
      last.text += text;
    } else {
      runs.push({ ...styleOf(style), text, x });
    }
    x += measure(text, style);
  };
  words.forEach((word, i) => {
    if (i > 0) {
      // Fett und Kursiv sind auf einem Leerzeichen unsichtbar; ein Unterstrich
      // nicht — er läuft nur dann unter dem Leerzeichen durch, wenn auch das
      // nächste Wort unterstrichen ist. Sonst hinge er hinter dem Lauf über.
      const next = word[0];
      append(' ', { ...spaceStyle, underline: spaceStyle.underline && !!next?.underline });
    }
    for (const frag of word) append(frag.text, frag);
    spaceStyle = trailingStyle(word, spaceStyle);
  });
  return runs;
}

function layoutSegment(segment: string, maxWidth: number, measure: MeasureRun): PositionedRun[][] {
  return wrapRichSegment(parseInlineMarks(segment), maxWidth, measure).map((words) =>
    positionLine(words, measure)
  );
}

const lineText = (runs: PositionedRun[]): string => runs.map((run) => run.text).join('');

/**
 * Umbruch auf `maxWidth` — an Wortgrenzen UND an `\n`.
 *
 * Der zweite Teil ist der Punkt: ein harter Umbruch im Text ist eine Zeile,
 * die Konva auch als Zeile setzt. Wer ihn beim Messen übergeht, unterschätzt
 * die Höhe jeder Aufzählung. Auszeichnungsmarker sind in den gelieferten
 * Zeilen bereits entfernt.
 */
export function wrapLines(text: string, maxWidth: number, measure: MeasureText): string[] {
  const out: string[] = [];
  for (const segment of text.split('\n')) {
    out.push(...layoutSegment(segment, maxWidth, measure).map(lineText));
  }
  return out;
}

/**
 * Setzt einen Textblock auf `maxWidth` und liefert die fertigen Zeilen als
 * Läufe mit Position und Einzug. Ohne Marker ist das schlichter Umbruch mit
 * `indent: 0`.
 *
 * Mit Marker bekommen ALLE Punkte denselben Einzug — gemessen am breitesten
 * Marker des Blocks, damit die Texte einer Liste bündig stehen und nicht je
 * nach Ziffernbreite auseinanderlaufen. Die Fortsetzungszeilen eines Punktes
 * tragen denselben Einzug wie seine erste: genau das ist der hängende Einzug,
 * ohne den ein umbrechender Punkt wie ein neuer Punkt aussieht.
 */
export function layoutRichTextBlock(
  text: string,
  maxWidth: number,
  measure: MeasureRun
): RichLayoutedLine[] {
  const items = splitListItems(text);
  const markers = items.filter((item) => item.marker !== null);

  if (markers.length === 0) {
    const out: RichLayoutedLine[] = [];
    for (const segment of text.split('\n')) {
      for (const runs of layoutSegment(segment, maxWidth, measure)) {
        out.push({ runs, indent: 0, marker: null });
      }
    }
    return out;
  }

  const indent = Math.max(...markers.map((item) => measure(`${item.marker} `, PLAIN_STYLE)));

  const out: RichLayoutedLine[] = [];
  for (const item of items) {
    const itemIndent = item.marker === null ? 0 : indent;
    const lines = layoutSegment(item.body, Math.max(maxWidth - itemIndent, 1), measure);
    lines.forEach((runs, i) => {
      out.push({ runs, indent: itemIndent, marker: i === 0 ? item.marker : null });
    });
  }
  return out;
}

/**
 * Wie {@link layoutRichTextBlock}, aber je Zeile nur der Text — für Aufrufer,
 * die Zeilen zählen oder mit einem Stil zeichnen.
 */
export function layoutTextBlock(
  text: string,
  maxWidth: number,
  measure: MeasureText
): LayoutedLine[] {
  return layoutRichTextBlock(text, maxWidth, measure).map((line) => ({
    text: lineText(line.runs),
    indent: line.indent,
    marker: line.marker,
  }));
}
