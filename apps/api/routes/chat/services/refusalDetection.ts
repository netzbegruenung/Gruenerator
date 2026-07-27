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
 * German: `ich kann/darf` + negation + a HELP/PRODUCE verb, all within one
 * sentence. The verb list is the discriminator — "Ich kann nicht zusehen, wie …"
 * is a stance, "Ich kann dir dabei nicht helfen" is a refusal.
 */
const GERMAN_REFUSAL_RE =
  /\bich\s+(?:kann|darf)\b[^.!?]{0,70}?\b(?:nicht|kein\w*)\b[^.!?]{0,45}?\b(?:helfen|weiterhelfen|behilflich|unterstützen|erstellen|erzeugen|generieren|verfassen|schreiben|anfertigen|liefern|bereitstellen|mitwirken)\b/i;

export type RefusalLanguage = 'de' | 'en';

/** The language a refusal was written in, or null when the text isn't one. */
export function refusalLanguage(text: string): RefusalLanguage | null {
  if (typeof text !== 'string' || text.trim().length === 0) return null;
  if (ENGLISH_REFUSAL_RE.test(text)) return 'en';
  if (GERMAN_REFUSAL_RE.test(text)) return 'de';
  return null;
}

/** True when the generated content is a refusal rather than the asked-for text. */
export function looksLikeRefusal(text: string): boolean {
  return refusalLanguage(text) !== null;
}
