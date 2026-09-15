/**
 * Canvas-Textlayout — geteilt, DOM-frei, Client + Server.
 *
 * Ein Sharepic-Textfeld ist ein flacher String; eine Aufzählung ist darin
 * nichts als Text, dessen Zeilen mit einem Marker beginnen. Es gibt bewusst
 * kein Listenmodell im Zustand und keins im Contract (`canvasTemplateDescriptors`
 * adressiert Textfelder als Strings, und Contract-Feldnamen sind eingefroren).
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
 */

/** Misst die Breite von `text` in px unter der aktuell gesetzten Schrift. */
export type MeasureText = (text: string) => number;

/** Das Zeichen, auf das alle Strich-Marker vereinheitlicht werden. */
export const LIST_BULLET = '•';

export interface ListItem {
  /** Marker ohne Abstand (`•`, `2.`) — `null` für eine gewöhnliche Zeile. */
  marker: string | null;
  /** Zeileninhalt ohne Marker. */
  body: string;
}

export interface LayoutedLine {
  /** Der Text dieser Zeile, ohne Marker. */
  text: string;
  /** Abstand vom linken Rand des Blocks in px (hängender Einzug). */
  indent: number;
  /** Nur auf der ERSTEN Zeile eines Punktes gesetzt; steht am Blockrand. */
  marker: string | null;
}

/** Strich-Marker, die auf `•` vereinheitlicht werden. */
const DASH_MARKER_RE = /^([ \t]*)[-*–][ \t]+/;

/** Eine Markerzeile: Strich, Bullet oder Ziffer, gefolgt von Abstand. */
const LINE_MARKER_RE = /^[ \t]*([-*–•]|\d{1,3}[.)])[ \t]+(.*)$/;

const isNumericMarker = (marker: string): boolean => /^\d/.test(marker);

/**
 * `- Punkt` / `* Punkt` / `– Punkt` → `• Punkt`, zeilenweise.
 * Nummerierte Punkte bleiben unangetastet — ihre Reihenfolge ist Information.
 */
export function normalizeListMarkers(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(DASH_MARKER_RE, `$1${LIST_BULLET} `))
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
  const matches = lines.map((line) => LINE_MARKER_RE.exec(line));
  const numericCount = matches.filter((m) => m !== null && isNumericMarker(m[1]!)).length;
  const acceptNumeric = numericCount >= 2;

  return lines.map((line, i) => {
    const m = matches[i];
    if (!m || (isNumericMarker(m[1]!) && !acceptNumeric)) {
      return { marker: null, body: line.trim() };
    }
    return { marker: m[1]!, body: m[2]!.trim() };
  });
}

/** Trägt der Block mindestens eine als Marker gewertete Zeile? */
export function hasListMarkers(text: string): boolean {
  return splitListItems(text).some((item) => item.marker !== null);
}

/**
 * Bricht ein Wort, das allein schon zu breit ist, INNERHALB des Wortes um.
 * Konva tut das von sich aus; weil wir die Zeilen vorberechnen und mit
 * `wrap="none"` setzen, greift sein Netz nicht mehr und wir brauchen unseres.
 */
function breakWord(word: string, maxWidth: number, measure: MeasureText): string[] {
  const chunks: string[] = [];
  let chunk = '';
  for (const char of word) {
    const test = chunk + char;
    if (chunk && measure(test) > maxWidth) {
      chunks.push(chunk);
      chunk = char;
    } else {
      chunk = test;
    }
  }
  if (chunk) chunks.push(chunk);
  return chunks.length > 0 ? chunks : [word];
}

/** Bricht EINE Zeile (ohne `\n`) an Wortgrenzen auf `maxWidth` um. */
function wrapSegment(segment: string, maxWidth: number, measure: MeasureText): string[] {
  if (segment === '') return [''];
  if (!Number.isFinite(maxWidth) || maxWidth <= 0) return [segment];

  const lines: string[] = [];
  let current = '';

  for (const word of segment.split(' ')) {
    const test = current === '' ? word : `${current} ${word}`;
    if (measure(test) <= maxWidth) {
      current = test;
      continue;
    }
    if (current !== '') {
      lines.push(current);
      current = '';
    }
    if (measure(word) > maxWidth) {
      const chunks = breakWord(word, maxWidth, measure);
      lines.push(...chunks.slice(0, -1));
      current = chunks[chunks.length - 1] ?? '';
    } else {
      current = word;
    }
  }

  if (current !== '') lines.push(current);
  return lines.length > 0 ? lines : [''];
}

/**
 * Umbruch auf `maxWidth` — an Wortgrenzen UND an `\n`.
 *
 * Der zweite Teil ist der Punkt: ein harter Umbruch im Text ist eine Zeile,
 * die Konva auch als Zeile setzt. Wer ihn beim Messen übergeht, unterschätzt
 * die Höhe jeder Aufzählung.
 */
export function wrapLines(text: string, maxWidth: number, measure: MeasureText): string[] {
  const out: string[] = [];
  for (const segment of text.split('\n')) out.push(...wrapSegment(segment, maxWidth, measure));
  return out;
}

/**
 * Setzt einen Textblock auf `maxWidth` und liefert die fertigen Zeilen mit
 * ihrem Einzug. Ohne Marker ist das schlichter Umbruch mit `indent: 0`.
 *
 * Mit Marker bekommen ALLE Punkte denselben Einzug — gemessen am breitesten
 * Marker des Blocks, damit die Texte einer Liste bündig stehen und nicht je
 * nach Ziffernbreite auseinanderlaufen. Die Fortsetzungszeilen eines Punktes
 * tragen denselben Einzug wie seine erste: genau das ist der hängende Einzug,
 * ohne den ein umbrechender Punkt wie ein neuer Punkt aussieht.
 */
export function layoutTextBlock(
  text: string,
  maxWidth: number,
  measure: MeasureText
): LayoutedLine[] {
  const items = splitListItems(text);
  const markers = items.filter((item) => item.marker !== null);

  if (markers.length === 0) {
    return wrapLines(text, maxWidth, measure).map((line) => ({
      text: line,
      indent: 0,
      marker: null,
    }));
  }

  const indent = Math.max(...markers.map((item) => measure(`${item.marker} `)));

  const out: LayoutedLine[] = [];
  for (const item of items) {
    const itemIndent = item.marker === null ? 0 : indent;
    const lines = wrapLines(item.body, Math.max(maxWidth - itemIndent, 1), measure);
    lines.forEach((line, i) => {
      out.push({ text: line, indent: itemIndent, marker: i === 0 ? item.marker : null });
    });
  }
  return out;
}
