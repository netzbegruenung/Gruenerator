/**
 * Teilt einen sehr langen Ausgangstext in Abschnitte, die je für sich
 * übertragen und geprüft werden.
 *
 * Gemessen am 19.10.2026: ein Original von 12567 Zeichen geht in EINEM
 * Durchlauf vollständig durch (45 von 45 Punkten). Darüber wird es aus zwei
 * Richtungen eng — die Prüfung sieht vom Original höchstens 24000 Zeichen, und
 * eine Fassung in Leichter Sprache ist länger als ihr Original. Deshalb erst ab
 * `SECTION_THRESHOLD`; darunter bleibt alles ein Abschnitt.
 */

export const SECTION_THRESHOLD = 25_000;
const TARGET = 12_000;
/** Ab hier darf ein Abschnitt an einer Überschrift enden. */
const MIN_BEFORE_BREAK = 6_000;

/**
 * Sieht die Zeile wie eine Überschrift aus? Markdown-`#`, oder kurz und ohne
 * Satzzeichen am Ende — eingefügte Webseiten bringen keine `#` mit, ihre
 * Zwischentitel stehen aber als kurze eigene Zeile da.
 */
function isHeading(line: string): boolean {
  const t = line.trim();
  if (/^#{1,6}\s/.test(t)) return true;
  return t.length > 0 && t.length <= 90 && !/[.,;:!]$/.test(t) && /^[A-ZÄÖÜ0-9„"]/.test(t);
}

export function splitForTransfer(text: string): string[] {
  if (text.length <= SECTION_THRESHOLD) return [text];

  const lines = text.split('\n');
  const sections: string[] = [];
  let current: string[] = [];
  let size = 0;

  for (const line of lines) {
    const atHeading = isHeading(line) && size >= MIN_BEFORE_BREAK;
    // Hart geteilt wird nur zwischen Zeilen, nie mitten in einem Absatz.
    if (current.length > 0 && (atHeading || size + line.length > TARGET)) {
      sections.push(current.join('\n'));
      current = [];
      size = 0;
    }
    current.push(line);
    size += line.length + 1;
  }
  if (current.length > 0) sections.push(current.join('\n'));

  // Ein kurzer Rest am Ende gehört zum vorigen Abschnitt — ein eigener Durchlauf
  // für drei Zeilen Schluss kostet eine ganze Prüfkette.
  const last = sections[sections.length - 1];
  if (sections.length > 1 && last !== undefined && last.length < MIN_BEFORE_BREAK / 2) {
    sections.pop();
    sections[sections.length - 1] += `\n${last}`;
  }
  return sections;
}
