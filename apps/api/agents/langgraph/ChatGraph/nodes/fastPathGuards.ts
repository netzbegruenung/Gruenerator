/**
 * Shared guards for the Tier-3 keyword fast paths (classifierHeuristics.ts) and
 * the Tier-2 social block (classifierNode.ts). Each generation fast path fires
 * on a bare artifact noun ("Sharepic", "Grafik", "Tabelle") at confidence ≥ 0.85
 * and skips the LLM. Three cases must NOT fire generation:
 *   - the noun is negated       ("KEIN Sharepic", "ohne Bild", "keine Grafik")
 *   - the message is a question  ABOUT the artifact ("Was macht ein gutes … aus?")
 *   - the noun sits in a quote   (reported speech: „Erstell ein Sharepic")
 * Leaf module (no imports from the classifier) so both callers can share it and
 * it unit-tests in isolation (fastPathGuards.vitest.ts).
 */

/**
 * Quoted spans are reported speech, not the user's own ask. Straight single
 * quotes are deliberately NOT stripped — they collide with German apostrophes
 * ("geht's", "wie viele Fuß"). The 240-char cap bounds work and skips
 * degenerate unbalanced quotes.
 */
const QUOTED_SPAN_PATTERNS: readonly RegExp[] = [
  /„[^“”„"]{0,240}["“”]/g, // German „…" (curly or sloppy straight closer)
  /»[^«»]{0,240}«/g, // guillemets »…«
  /«[^«»]{0,240}»/g, // French-style «…» (Swiss usage)
  /"[^"\n]{0,240}"/g, // straight double quotes
  /‚[^‘’]{0,240}[‘’]/g, // German single ‚…'
];

/** Replace quoted spans with a space so noun tests don't fire on reported speech. */
export function stripQuotedSpans(text: string): string {
  let out = text;
  for (const p of QUOTED_SPAN_PATTERNS) out = out.replace(p, ' ');
  return out;
}

// Negator immediately before the noun ("KEIN Sharepic", "ohne Bild", "nicht als
// Tabelle"). Anchored to end-of-window so it sits close to the noun; [^.!?\n]
// keeps it inside one sentence ("Nicht schlecht! Erstell ein Sharepic" is not a
// negation). `statt`/`anstelle` are deliberately excluded: they take an object
// between the negator and the target ("statt eines Posts ein Sharepic" negates
// Post, not Sharepic), which no bounded window can disambiguate — excluding
// them avoids false stand-downs at the cost of missing the rarer "statt einer
// Grafik" shape (which then just keeps today's behavior).
const NEGATOR_BEFORE_RE = /\b(kein\w{0,2}|nicht|ohne|nie(?:mals)?)\b[^.!?\n]{0,20}$/i;
// Negator shortly after the noun ("ein Sharepic will ich nicht").
const NEGATOR_AFTER_RE = /^[^.!?\n]{0,30}?\b(nicht|kein\w{0,2})\b/i;

/**
 * True when an occurrence of `nounPattern` is negated within a sentence-bounded
 * window. Per-noun-family: "statt eines Posts ein Sharepic" negates `post`, not
 * `sharepic`, so passing each branch its own noun yields correct routing.
 */
export function isNegatedArtifactRequest(text: string, nounPattern: RegExp): boolean {
  const g = new RegExp(
    nounPattern.source,
    nounPattern.flags.includes('g') ? nounPattern.flags : `${nounPattern.flags}g`
  );
  for (const m of text.matchAll(g)) {
    const i = m.index ?? 0;
    const end = i + m[0].length;
    if (NEGATOR_BEFORE_RE.test(text.slice(Math.max(0, i - 30), i))) return true;
    if (NEGATOR_AFTER_RE.test(text.slice(end, end + 30))) return true;
  }
  return false;
}

// A question-word-initial message that mentions the artifact noun is a question
// ABOUT the artifact ("Was macht ein gutes Sharepic aus?"), not a request to
// create one. Generalizes SOCIAL_META_QUESTION_PATTERN (classifierHeuristics.ts).
const META_QUESTION_START_RE =
  /^\s*(was|wie|wer|warum|wieso|weshalb|welche[rsnm]?|wann|wo|woran|wodurch|gibt\s+es)\b/i;

/** True when the message opens with a question word and mentions the noun. */
export function isMetaQuestionAbout(text: string, nounPattern: RegExp): boolean {
  return META_QUESTION_START_RE.test(text) && nounPattern.test(text);
}

/** The single conjunct a guarded fast path adds: true ⇒ stand down (defer/other). */
export function negatedOrMeta(text: string, nounPattern: RegExp): boolean {
  return isNegatedArtifactRequest(text, nounPattern) || isMetaQuestionAbout(text, nounPattern);
}
