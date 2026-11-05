/**
 * Messwerte des Wahlprüfstein-Evals: eine Antwort des Modells gegen die echte
 * Antwort der Partei auf denselben Katalog. Alles hier ist deterministisch;
 * Stil und Haltung beurteilt ein Mensch bzw. ein Richter über die Dateien.
 *
 * Kern ist `segmentAnswers`: der Text wird an den Fragen des Katalogs in
 * Abschnitte geteilt, und je Abschnitt werden die Zeilen abgezogen, die
 * wörtlich im Katalog stehen — übrig bleibt die Antwort. Die Referenz liegt
 * schon zerlegt vor (`reference.json`), gemessen wird mit denselben Zählern.
 */

const QUESTION_MARKER_RE =
  /^\s{0,3}(?:#{1,6}\s*)?(?:\*\*|__)?\s*(?:(?:Frage|These|Wahlprüfstein|Prüfstein|WPS)\s*)?(\d{1,2})\s*[.):]?(?:\*\*|__)?(?=\s|$)/i;

export function normalizeLine(line: string): string {
  return line
    .replace(/[*_#>`|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export interface AnswerSegment {
  n: number;
  /** Antworttext ohne Zeilen, die wörtlich im Katalog stehen. */
  answer: string;
}

export interface CatalogQuestion {
  n: number;
  text: string;
}

/** Die ersten Wörter einer Frage — daran wird sie im Antworttext wiedergefunden. */
function anchorOf(q: CatalogQuestion): string {
  return normalizeLine(q.text).split(' ').slice(0, 7).join(' ');
}

function startsQuestion(line: string, q: CatalogQuestion): boolean {
  const n = normalizeLine(line);
  if (n.length === 0) return false;
  const anchor = anchorOf(q);
  if (anchor.length >= 15 && n.includes(anchor)) return true;
  const m = QUESTION_MARKER_RE.exec(line);
  return m?.[1] !== undefined && Number(m[1]) === q.n;
}

/**
 * Teilt einen Antworttext an den Fragen des Katalogs — über den Wortlaut der
 * Frage (die ersten sieben Wörter) oder ihre Nummer, in Katalog-Reihenfolge.
 * Eine nicht gefundene Frage bekommt einen leeren Abschnitt; so zählt
 * „unbeantwortet" mit, statt die Nummerierung zu verschieben.
 */
export function segmentAnswers(
  text: string,
  questions: readonly CatalogQuestion[],
  catalog: string
): AnswerSegment[] {
  const catalogLines = new Set(
    catalog
      .split(/\r?\n/)
      .map(normalizeLine)
      .filter((l) => l.length > 12)
  );
  const lines = text.split(/\r?\n/);
  const starts: (number | null)[] = [];
  let from = 0;
  for (const q of questions) {
    let hit: number | null = null;
    for (let i = from; i < lines.length; i++) {
      if (startsQuestion(lines[i] ?? '', q)) {
        hit = i;
        break;
      }
    }
    starts.push(hit);
    if (hit !== null) from = hit + 1;
  }
  return questions.map((q, k) => {
    const s = starts[k];
    if (s === null || s === undefined) return { n: q.n, answer: '' };
    const next = starts.slice(k + 1).find((x): x is number => x !== null) ?? lines.length;
    const first = (lines[s] ?? '').replace(QUESTION_MARKER_RE, '');
    const body = [first, ...lines.slice(s + 1, next)].filter((l) => {
      const n = normalizeLine(l);
      if (n.length === 0 || catalogLines.has(n)) return false;
      for (const c of catalogLines) if (n.length > 30 && c.includes(n)) return false;
      return !n.includes(anchorOf(q)) || n.length > normalizeLine(q.text).length + 40;
    });
    return { n: q.n, answer: body.join('\n').trim() };
  });
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter((w) => /[\p{L}\d]/u.test(w)).length;
}

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? (s[mid] ?? null) : ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2;
}

/** Erste nicht-leere Zeile ist der Titel des Antwortdokuments. */
export function titleLine(text: string): string | null {
  const line = text.split(/\r?\n/).find((l) => l.trim().length > 0);
  return line ? line.replace(/[#*_]/g, '').trim() : null;
}

/** Bund/Europa: „Antworten auf die Wahlprüfsteine für/von <Verband> anlässlich der <Wahl>". */
export function hasFederalTitle(text: string): boolean {
  const t = titleLine(text) ?? '';
  return /^Antworten (?:von [^\n]{0,80} )?auf die Wahlprüfsteine\b/i.test(t);
}

/** Nennt die Titelzeile die Wahl, zu der der Katalog gehört? (btw21/btw25 → Bundestagswahl, ew24 → Europawahl) */
export function titleNamesElection(text: string, wahl: string): boolean {
  const t = titleLine(text) ?? '';
  return wahl.startsWith('ew') ? /Europawahl/i.test(t) : /Bundestagswahl/i.test(t);
}

export function hasReleaseNote(text: string): boolean {
  return /bedürfen erneuter Freigabe|Rückfragen (?:an|bitte)|\[Kontakt/i.test(text);
}

export function genderMarks(text: string): { star: number; colon: number; binnenI: number } {
  return {
    star: (text.match(/\p{L}\*(?:innen|in)\b/gu) ?? []).length,
    colon: (text.match(/\p{L}:(?:innen|in)\b/gu) ?? []).length,
    binnenI: (text.match(/\p{Ll}In(?:nen)?\b/gu) ?? []).length,
  };
}

/** Anteil der Antworten mit Wir-Form (`wir`, `uns`, `unser…`). */
export function wirShare(segments: AnswerSegment[]): number | null {
  const withText = segments.filter((s) => s.answer.length > 0);
  if (withText.length === 0) return null;
  const wir = withText.filter((s) => /\b(?:wir|uns|unser\w*)\b/i.test(s.answer)).length;
  return wir / withText.length;
}

/** Nachricht endet mit einer Rückfrage oder einem Angebot („Soll ich …?"). */
export function hasClosingOffer(text: string): boolean {
  const tail = text.trim().split(/\r?\n/).slice(-3).join(' ');
  return (
    /\?\s*$/.test(tail) || /\b(?:Soll ich|Möchtest du|Wenn du möchtest|Sag Bescheid)\b/i.test(tail)
  );
}

/** Ausrufezeichen in Antworten — im Korpus praktisch null. */
export function exclamationCount(segments: AnswerSegment[]): number {
  return segments.reduce((n, s) => n + (s.answer.match(/!/g) ?? []).length, 0);
}
