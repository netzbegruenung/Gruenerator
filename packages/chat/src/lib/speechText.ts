/**
 * What the reading voice gets to see of an assistant reply.
 *
 * Citation markers come in both wire forms (`[cite:12]` persisted, `[3]` or
 * `[3, 4]` streamed) and mean nothing aloud. The pattern is anchored to the
 * brackets on purpose: an earlier version stripped every digit, so "2026"
 * and "3 Millionen" were read as silence.
 */
// Only horizontal whitespace in front: a marker at the start of a line must
// not swallow the line break before it and merge two lines.
const CITATION_RE = /[ \t]*\[(?:cite:)?\d+(?:\s*,\s*\d+)*\]/g;
// A comma run that ends at sentence punctuation only ever separated
// citations. It is matched greedily with nothing mandatory behind it and
// judged in the callback: a lookahead after the run would make the engine
// hand back one comma at a time on every failure (6.7 s for 50k commas).
const COMMA_RUN_RE = /[ \t]*,[ \t,]*/g;
const SENTENCE_END = new Set(['.', '!', '?', ';', ':']);

function dropOrphanCommas(text: string): string {
  return text.replace(COMMA_RUN_RE, (run: string, offset: number) =>
    SENTENCE_END.has(text.charAt(offset + run.length)) ? '' : run
  );
}
// Neither class may contain the bracket that closes it, or a run of "[" makes
// the engine backtrack quadratically (CodeQL: polynomial regex on model text).
const LINK_RE = /\[([^[\]]+)\]\([^()]*\)/g;
const LIST_MARKER_RE = /^[ \t]*(?:[-*+]|\d+\.)[ \t]+/gm;
const DECORATION_RE = /[#*_`~>|]/g;

export function stripForSpeech(text: string): string {
  return dropOrphanCommas(text.replace(LINK_RE, '$1').replace(CITATION_RE, ''))
    .replace(LIST_MARKER_RE, '')
    .replace(DECORATION_RE, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/^[ \t]+/gm, '')
    .trim();
}
