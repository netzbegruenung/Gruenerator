/**
 * Sätze und Inhaltswörter — die zwei Bausteine, mit denen Notebook-Werkzeuge
 * (`notebook_quellen` stats/cite) und die Zitat-Aufbereitung der
 * Notebook-Antwort (`citationQuote.ts`) Belegsätze finden. Eigenes Modul ohne
 * Abhängigkeiten, weil `services/notebook` die Suche importiert und die Suche
 * diese Helfer braucht.
 */

/** Satzende: `.!?…` vor Leerraum und Großbuchstaben. „Dr. med." bleibt heil, „Dr. Müller" nicht. */
const SENTENCE_BOUNDARY = /[.!?…]+(?=\s+\p{Lu})/gu;
const HAS_WORD = /[\p{L}\p{N}]/u;
const CONTENT_TOKEN_MIN = 4;

/** Die Sätze eines Texts mit Offsets; Leerraum am Rand gehört nicht dazu. */
export function splitSentences(text: string): Array<{ text: string; start: number; end: number }> {
  const cuts = [...text.matchAll(SENTENCE_BOUNDARY)].map((m) => m.index + m[0].length);
  const bounds = [0, ...cuts, text.length];
  const out: Array<{ text: string; start: number; end: number }> = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const raw = text.slice(bounds[i], bounds[i + 1]);
    if (!HAS_WORD.test(raw)) continue;
    const start = bounds[i]! + (raw.length - raw.trimStart().length);
    const trimmed = raw.trim();
    out.push({ text: trimmed, start, end: start + trimmed.length });
  }
  return out;
}

/** Wörter ab vier Zeichen, kleingeschrieben — kurze Funktionswörter trennen nichts. */
export function contentWords(text: string): Set<string> {
  return new Set(
    [...text.matchAll(/[\p{L}\p{N}]+/gu)]
      .map((m) => m[0].toLowerCase())
      .filter((w) => w.length >= CONTENT_TOKEN_MIN)
  );
}
