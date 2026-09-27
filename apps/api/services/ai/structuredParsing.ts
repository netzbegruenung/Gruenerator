/**
 * Getting a candidate object out of an answer, and getting an existing parser
 * into the `validate` slot of `aiObject`.
 *
 * Separate from `generate.ts` because none of it talks to a model: it is the
 * part of structured generation that runs on a string that already arrived.
 */

/** Caller-supplied gate. Returning an error message drives the repair turn. */
export type StructuredValidation<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Bridge an existing lax parser into the `validate` slot.
 *
 * Those parsers take a JSON STRING and NORMALIZE rather than reject (casting,
 * capping, dropping malformed entries). Round-tripping the tool call's object
 * through JSON.stringify reuses that exact normalization for both the tool path
 * and the text-fallback path, so the two cannot drift — and it keeps the forced
 * tool call from making generation STRICTER than before, which would turn
 * today's repairable output into new failures.
 */
export function viaLaxParser<T>(
  parse: (raw: string) => T | null,
  missing: string
): (input: unknown) => StructuredValidation<T> {
  return (input: unknown) => {
    const value = parse(JSON.stringify(input));
    return value ? { ok: true, value } : { ok: false, error: missing };
  };
}

/**
 * Adapt a parser that never returns null but signals failure with empty
 * content (parseDocumentResponse) into the null-on-failure shape.
 */
export function withContent<T extends { content: string }>(
  parse: (raw: string) => T
): (raw: string) => T | null {
  return (raw: string) => {
    const parsed = parse(raw);
    return parsed.content ? parsed : null;
  };
}

/**
 * JSON candidates from a text answer, in the order they were tried before:
 * the bare body, a fenced block, then the widest `{…}` in the prose. Only
 * candidates that PARSE are yielded — validation is the caller's job, so a
 * rejection carries the field path instead of vanishing into a `null`.
 */
export function jsonCandidatesFromText(text: string): unknown[] {
  // Deduplicated: a bare JSON body matches the plain and the braced shape
  // alike, and validating the identical string twice is what produced the
  // duplicated "structure rejected" lines that made the logs hard to read.
  const raws = new Set([text.trim()]);
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) raws.add(fenced[1].trim());
  const braced = text.match(/\{[\s\S]*\}/);
  if (braced) raws.add(braced[0]);

  const parsed: unknown[] = [];
  for (const raw of raws) {
    try {
      parsed.push(JSON.parse(raw));
    } catch {
      // Not this shape — try the next.
    }
  }
  return parsed;
}
