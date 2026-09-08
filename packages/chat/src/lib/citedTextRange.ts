/**
 * Locate the quoted passage inside the stored chunk, so the panel can mark the
 * words the answer actually used instead of boxing the whole chunk.
 *
 * A byte-exact match is the exception, not the rule: `citedText` travels through
 * the model and the SSE contract, where newlines collapse and runs of spaces
 * shrink. So a direct `indexOf` runs first, and a whitespace-tolerant pass backs
 * it up — that pass matches on a normalised copy but returns offsets into the
 * ORIGINAL, so the rendered slices keep the source's own line breaks.
 *
 * Returns `null` when the passage cannot be located. The caller then renders the
 * chunk unmarked, which is the honest outcome: a highlight in the wrong place
 * misattributes the quote.
 */
export function findCitedRange(text: string, cited: string | undefined): [number, number] | null {
  const needle = cited?.trim();
  // Short fragments match by accident ("und", "die"), and a wrong highlight is
  // worse than none — the panel exists to show what was quoted.
  if (!needle || needle.length < 12) return null;

  const direct = text.indexOf(needle);
  if (direct !== -1) return [direct, direct + needle.length];

  // Normalised copy + index map back into `text`.
  const map: number[] = [];
  let normalised = '';
  let gap = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      gap = normalised.length > 0;
      continue;
    }
    if (gap) {
      map.push(i);
      normalised += ' ';
      gap = false;
    }
    map.push(i);
    normalised += ch;
  }

  const at = normalised.indexOf(needle.replace(/\s+/g, ' '));
  if (at === -1) return null;

  const end = at + needle.replace(/\s+/g, ' ').length - 1;
  return [map[at], map[end] + 1];
}
