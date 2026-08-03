/**
 * Post-process the synthesized answer to remove citation markers the source
 * registry can't back. The synth prompt tells the model which [N] exist, but
 * models still emit out-of-range numbers ("[4]…[9]" with 3 sources registered).
 * Pure so it unit-tests in isolation (citationStrip.vitest.ts); the caller emits
 * the corrected text via the `completion` SSE event (the frontend replaces the
 * streamed deltas with it).
 */

/** Bracketed citation groups: [3] or [3, 7]. */
const CITE_GROUP_RE = /\[(\d+(?:\s*,\s*\d+)*)\]/g;

/**
 * Drop or trim `[N]` markers whose numbers fall outside `1..maxId`. A group with
 * some valid + some invalid numbers keeps only the valid ones ("[2, 7]" → "[2]"
 * when maxId=3); an all-invalid group is removed entirely. Whitespace left by a
 * removed marker is tidied so the prose reads cleanly.
 */
export function stripOutOfRangeCitations(
  text: string,
  maxId: number
): { text: string; changed: boolean } {
  const max = Math.max(0, maxId);
  let changed = false;

  const replaced = text.replace(CITE_GROUP_RE, (whole, inner: string) => {
    const nums = inner.split(/\s*,\s*/).map((n) => Number(n));
    const valid = nums.filter((n) => Number.isInteger(n) && n >= 1 && n <= max);
    if (valid.length === nums.length) return whole; // all valid — untouched
    changed = true;
    return valid.length === 0 ? '' : `[${valid.join(', ')}]`;
  });

  if (!changed) return { text, changed: false };

  // Tidy artifacts left by dropped markers: space-before-punctuation, doubled
  // spaces, empty parens, and a dangling space before a newline.
  const tidied = replaced
    .replace(/ +([.,;:!?])/g, '$1')
    .replace(/\(\s*\)/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .trim();

  return { text: tidied, changed: true };
}
