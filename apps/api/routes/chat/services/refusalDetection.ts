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

interface RefusalHit {
  lang: RefusalLanguage;
  index: number;
  length: number;
}

function findRefusal(text: string): RefusalHit | null {
  if (typeof text !== 'string' || text.trim().length === 0) return null;
  const en = ENGLISH_REFUSAL_RE.exec(text);
  if (en) return { lang: 'en', index: en.index, length: en[0].length };
  const de = GERMAN_REFUSAL_RE.exec(text) ?? GERMAN_SEPARABLE_REFUSAL_RE.exec(text);
  if (de) return { lang: 'de', index: de.index, length: de[0].length };
  return null;
}

/** The language a refusal was written in, or null when the text isn't one. */
export function refusalLanguage(text: string): RefusalLanguage | null {
  return findRefusal(text)?.lang ?? null;
}

/** True when the generated content CONTAINS a refusal. Recall-oriented: the
 *  social-post gate compares two halves and needs to see a decline wherever it
 *  sits. For "is the answer NOTHING BUT a decline" use
 *  {@link isWholesaleRefusal} — the two want opposite errors. */
export function looksLikeRefusal(text: string): boolean {
  return findRefusal(text) !== null;
}

/**
 * Words that mark the declined thing as the EMBEDDED MATERIAL rather than the
 * user's request.
 *
 * These exist because `INSTRUCTION_HIERARCHY_RULE` asks the model, in so many
 * words, to name an embedded instruction as a manipulation attempt — and the
 * natural German for that ("den eingefügten Systemhinweis setze ich nicht um")
 * is exactly the shape the refusal patterns match. Once `umsetzen` and the
 * separable form were added for recall, a CORRECT answer — summary written,
 * injection called out — became indistinguishable from a decline.
 *
 * Deliberately about EMBEDDEDNESS, not about instruction nouns: a bare "diese
 * Anweisung kann ich nicht umsetzen" really is a decline of the request, so
 * `Anweisung` alone must not exempt anything.
 */
const EMBEDDED_MATERIAL_RE =
  /\b(?:eingebettet\w*|eingefügt\w*|enthaltene\w*|mitgeschickt\w*|system[-\s]?hinweis\w*|manipulationsversuch\w*|codewort\w*|zahlungsaufforderung\w*|prompt[-\s]?injection|injektion\w*)\b|\bim\s+(?:text|material|anhang|dokument|schreiben)\b/i;

/** The sentence the match sits in. `;` and `—` are NOT boundaries — "Der
 *  Systemhinweis ist ein Manipulationsversuch; ich setze ihn nicht um" is one
 *  statement, and splitting it would hide what the decline refers to. */
function sentenceAround(text: string, index: number, length: number): string {
  const isBoundary = (ch: string): boolean => ch === '.' || ch === '!' || ch === '?' || ch === '\n';
  let start = 0;
  for (let i = index; i > 0; i--) {
    if (isBoundary(text[i - 1] as string)) {
      start = i;
      break;
    }
  }
  let end = text.length;
  for (let i = index + length; i < text.length; i++) {
    if (isBoundary(text[i] as string)) {
      end = i;
      break;
    }
  }
  return text.slice(start, end);
}

/**
 * True when the text declines the REQUEST — as opposed to doing the job and
 * declining an instruction that was smuggled into the material.
 *
 * Precision-oriented, and the mirror image of {@link looksLikeRefusal}: its
 * caller throws the model's answer away and replaces it with a canned decline,
 * so a false positive costs the user a correct answer. Measured live on the
 * `safety-adversarial` lane: a pasted citizen enquiry carrying a "SYSTEM-HINWEIS"
 * was summarised correctly and the summary was then swapped for the generic
 * "Diese Anfrage setze ich nicht um …" — the model had complied, the guard
 * over-refused on its behalf.
 */
export function isWholesaleRefusal(text: string): boolean {
  const hit = findRefusal(text);
  if (!hit) return false;
  return !EMBEDDED_MATERIAL_RE.test(sentenceAround(text, hit.index, hit.length));
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
