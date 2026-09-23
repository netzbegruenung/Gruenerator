/**
 * Whether an answer looks CUT OFF rather than finished: a completed German
 * answer ends on punctuation, so a trailing letter or digit is the signature of
 * a stream that stopped mid-sentence.
 *
 * Shared by the server (`outputSanity.ts`, synth validation + `chars=` log) and
 * the chat client (`parseSSEStream`), so the two logs compare like with like:
 *
 *   server suspicious + client suspicious → generation stopped early
 *                                            (pair it with finishReason)
 *   server clean      + client suspicious → the tail was lost after the server
 *                                            handed it over (transport/render)
 */

/**
 * Fewer words than this and an unpunctuated ending says nothing: that is the
 * shape of a LABEL, not of a severed sentence.
 *
 * Empirical, not invented. A QA session asked for three literal wordings and
 * got a warning for each — "KEINE DATEN", "Korrigiert", "Klarwasser
 * gespeichert" (1–2 words), all three perfect answers — beside ONE real
 * truncation. Meanwhile the shortest cut this check exists to catch runs six
 * words ("Im Vergleich zu anderen rechtspopulistischen Pa"). Five sits in that
 * gap. It is a threshold, not a law: a cut after four words slips through, and
 * that is the price of a warning that means something when it appears.
 */
export const TRUNCATION_MIN_WORDS = 5;

// No lookbehind: the client bundle targets Safari 15 (check-browser-lookbehind.mjs).
const CLOSING_FORMULA_RE = /(?:^|[^\wäöüß])(?:grü(?:ß|ss)e[n]?|gru(?:ß|ss))(?![\wäöüß])/iu;
const SIGNATURE_LINE_MAX = 60;
const SIGNATURE_MAX_LINES = 4;

/**
 * Letters, replies to citizens and press releases end on a signature by design
 * ("Mit freundlichen Grüßen\n\n[Dein Name]\nBündnis 90/Die Grünen"), posts on a
 * hashtag line. Those end on a letter and are finished (#3628): a short closing
 * formula followed only by short signature lines, or a final line of hashtags.
 */
function endsInClosingBlock(trimmed: string): boolean {
  const lines = trimmed
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const last = lines[lines.length - 1] ?? '';
  if (/^#[\p{L}\p{N}_]+(?:\s+#[\p{L}\p{N}_]+)*$/u.test(last)) return true;

  const tail = lines.slice(-(SIGNATURE_MAX_LINES + 1));
  for (let i = tail.length - 1; i >= 0; i--) {
    const line = tail[i] ?? '';
    if (line.length > SIGNATURE_LINE_MAX) return false;
    if (line.split(/\s+/).length <= 4 && CLOSING_FORMULA_RE.test(line)) return true;
  }
  return false;
}

export function looksCutOff(text: string): boolean {
  const trimmed = text.trimEnd();
  if (trimmed.split(/\s+/).filter(Boolean).length < TRUNCATION_MIN_WORDS) return false;
  if (!/[\p{L}\p{N}]$/u.test(trimmed)) return false;
  return !endsInClosingBlock(trimmed);
}
