/**
 * Post-process the synthesized answer to remove citation markers the source
 * registry can't back. The synth prompt tells the model which [N] exist, but
 * models still emit out-of-range numbers ("[4]…[9]" with 3 sources registered).
 * Pure so it unit-tests in isolation (citationStrip.vitest.ts); the caller emits
 * the corrected text via the `completion` SSE event (the frontend replaces the
 * streamed deltas with it).
 */

import { citationReferenceRegex, SOURCE_LINK_SCHEME } from '@gruenerator/shared/utils';

/**
 * Drop or trim `[N]` markers whose numbers fall outside `1..maxId`. A group with
 * some valid + some invalid numbers keeps only the valid ones ("[2, 7]" → "[2]"
 * when maxId=3); an all-invalid group is removed entirely. A source link to an
 * unknown id keeps its title as plain text; a link in a translated scheme
 * (`source:N`) is rewritten to `quelle:N`. Whitespace left by a removed marker
 * is tidied so the prose reads cleanly.
 */
export function stripOutOfRangeCitations(
  text: string,
  maxId: number
): { text: string; changed: boolean } {
  const max = Math.max(0, maxId);
  // Two kinds of change: a dropped marker leaves gaps the tidy pass closes; a
  // scheme rewrite (`source:` → `quelle:`) changes nothing else, so the rest of
  // the answer — code blocks, indentation — must come back untouched.
  let dropped = false;
  let rewritten = false;

  const inRange = (n: number) => Number.isInteger(n) && n >= 1 && n <= max;

  const replaced = text.replace(
    citationReferenceRegex(),
    (whole, label: string | undefined, linkId: string | undefined, inner: string | undefined) => {
      if (label !== undefined) {
        if (inRange(Number(linkId))) {
          const canonical = `[${label}](${SOURCE_LINK_SCHEME}:${linkId})`;
          if (canonical !== whole) rewritten = true;
          return canonical;
        }
        dropped = true;
        return label;
      }
      const nums = (inner ?? '').split(/\s*,\s*/).map((n) => Number(n));
      const valid = nums.filter(inRange);
      if (valid.length === nums.length) return whole; // all valid — untouched
      dropped = true;
      return valid.length === 0 ? '' : `[${valid.join(', ')}]`;
    }
  );

  if (!dropped) return { text: replaced, changed: rewritten };

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
