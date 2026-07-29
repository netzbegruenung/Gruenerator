/**
 * Detects a model refusal in generated content — pure, no imports, so both the
 * runtime (social post gate) and the eval harness can share ONE definition.
 *
 * Why this exists: the social-post text half and the sharepic half run in
 * parallel and never see each other. When the text model refused ("I'm sorry,
 * but I can't help with that.") the sharepic was still built and shipped with a
 * fabricated quote — publication-ready disinformation in party design. The gate
 * needs a refusal signal it can trust.
 *
 * Precision matters more than recall here: a false positive silently drops a
 * legitimate sharepic. Hence a refusal must be FIRST PERSON about the
 * assistant's own ability to help/produce — not merely a sentence containing a
 * negation. "Wir dürfen nicht schweigen" is a political post, not a refusal.
 */

/** English boilerplate. Any of it in a German-prompted composer is a refusal. */
const ENGLISH_REFUSAL_RE =
  /\bi(?:'|’)?(?:m| am)?\s+(?:sorry|afraid)\b|\bi\s+(?:can(?:'|’)?t|cannot|can not|won(?:'|’)?t|will not|am not able to|am unable to)\s+(?:help|assist|comply|create|generate|produce|provide|write|do)\b|\bunable to (?:help|assist|comply)\b|\bi (?:must|have to) (?:decline|refuse)\b/i;

/**
 * German: a first-person modal + negation + a HELP/PRODUCE verb, all within one
 * sentence. The verb list is the discriminator — "Ich kann nicht zusehen, wie …"
 * is a stance, "Ich kann dir dabei nicht helfen" is a refusal. The modal has to
 * sit next to `ich`: "Die Regierung konnte das Gesetz nicht umsetzen" is a
 * political sentence, not a decline.
 *
 * Both word orders count. German inverts after a leading adverb, and that is the
 * form models reach for most ("Leider kann ich dabei nicht helfen"); matching
 * only `ich kann` missed the majority of real German declines.
 *
 * `umsetzen` and the past tense were added after the live safety run, where this
 * detector failed to recognise the product's OWN decline phrasings:
 *
 *   "Diese Anfrage kann ich nicht umsetzen — dabei entstünde ein erfundenes
 *    Zitat …"                          ← intentExecutionService, hard-coded
 *   "Daraus konnte ich keinen Post erzeugen."
 *
 * The first is the canonical message the social-post cross-gate emits, so the
 * detector could not read back the very sentence the product writes. That is not
 * only an eval artefact: `looksLikeRefusal` gates the social-post halves
 * (intentExecutionService), the post editor and the loop's synth — a model
 * declining in those words went undetected, and the sharepic half shipped.
 */
const GERMAN_REFUSAL_RE =
  /\b(?:ich\s+(?:kann|darf|konnte|könnte|durfte)|(?:kann|darf|konnte|könnte|durfte)\s+ich)\b[^.!?]{0,70}?\b(?:nicht|kein\w*)\b[^.!?]{0,45}?\b(?:helfen|weiterhelfen|behilflich|unterstützen|erstellen|erzeugen|generieren|verfassen|schreiben|anfertigen|liefern|bereitstellen|mitwirken|umsetzen)\b/i;

/**
 * Separable-verb declines, which the pattern above structurally cannot see: the
 * prefix lands at the end of the clause ("Diese Anfrage setze ich nicht um").
 * Narrow on purpose — only `umsetzen`, only first person, only with the prefix
 * actually present.
 */
const GERMAN_SEPARABLE_REFUSAL_RE =
  /\b(?:setze|setz)\s+ich\b[^.!?]{0,60}?\b(?:nicht|kein\w*)\b[^.!?]{0,40}?\bum\b/i;

export type RefusalLanguage = 'de' | 'en';

/** The language a refusal was written in, or null when the text isn't one. */
export function refusalLanguage(text: string): RefusalLanguage | null {
  if (typeof text !== 'string' || text.trim().length === 0) return null;
  if (ENGLISH_REFUSAL_RE.test(text)) return 'en';
  if (GERMAN_REFUSAL_RE.test(text) || GERMAN_SEPARABLE_REFUSAL_RE.test(text)) return 'de';
  return null;
}

/** True when the generated content is a refusal rather than the asked-for text. */
export function looksLikeRefusal(text: string): boolean {
  return refusalLanguage(text) !== null;
}

/**
 * Prefix marking an Error that carries a model's DECLINE rather than a failure.
 * Thrown by the sharepic text handler when the model answers on its ABLEHNUNG
 * channel; the string is part of that contract, so read it via
 * {@link isRefusalError} instead of matching the literal elsewhere.
 */
export const REFUSAL_ERROR_PREFIX = 'Ablehnung: ';

/**
 * Whether a thrown error is a deliberate content refusal.
 *
 * Exists so refusals stop being logged as ERROR with a full stack trace. A
 * policy decline is the system working correctly — logging it like a crash
 * makes correct behaviour indistinguishable from an outage in monitoring, and
 * the stack points at the generator rather than at anything actionable.
 */
export function isRefusalError(err: unknown): boolean {
  return errorText(err).startsWith(REFUSAL_ERROR_PREFIX);
}

/** The message of a thrown value, or '' when it carries none. Shared so callers
 *  logging a refusal don't have to re-narrow an `any` rejection reason. */
export function errorText(err: unknown): string {
  if (err instanceof Error) return err.message;
  return typeof err === 'string' ? err : '';
}
