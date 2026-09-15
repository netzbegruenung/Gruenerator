/**
 * The fixed texts an artifact turn (sharepic, slider, social_post) ends with,
 * plus the matcher that recognises them again.
 *
 * Both halves belong together. `findPriorSubject` (referentialTopic.ts) must
 * skip these when a referential follow-up looks for the subject to inherit —
 * they carry none. Its old regex only knew the create_* templates ("… wurde
 * erstellt"), so the sharepic confirmation below — 112 characters, saying
 * "erstellt" but not "wurde erstellt" — was inherited as if it were content,
 * and "jetzt noch ein normales sharepic" produced a sharepic about the
 * confirmation instead of about the previous turn's topic.
 *
 * Keeping the strings and the matcher in one module is the point: a reworded
 * confirmation that no longer matches breaks a test here instead of silently
 * re-opening that bug.
 */

const variantWord = (n: number): string => (n === 1 ? 'Variante' : 'Varianten');

/**
 * Sharepic turn finished: N variants, or a slider deck with N slides. A zero
 * slide count is not a deck — it reads as the plain variant case, as before.
 */
export function buildSharepicConfirmation(variantCount: number, deckSlides?: number): string {
  if (deckSlides) {
    return (
      `Ich habe dir ein Slider-Karussell mit ${deckSlides} Folien erstellt. ` +
      `Sag mir, was ich an einzelnen Folien anpassen soll, oder öffne es im Studio.`
    );
  }
  return (
    `Ich habe dir ${variantCount} Sharepic-${variantWord(variantCount)} erstellt. ` +
    `Wähle eine aus oder sag mir, was ich am Text oder Bild anpassen soll.`
  );
}

/**
 * The branches that need no interpolation. Kept as constants rather than one
 * builder so the routers keep their own condition trees — only the wording
 * moves here.
 */
export const ARTIFACT_CONFIRMATION_TEXTS = {
  sharepicFailed:
    `Die Sharepic-Erstellung hat leider nicht geklappt. Magst du es mit einem ` +
    `anderen Thema noch einmal versuchen?`,
  genericFailed: `Das hat leider nicht geklappt. Magst du es mit einem anderen Thema noch einmal versuchen?`,
} as const;

/**
 * The create_* handlers persist their own templated confirmations
 * ("PDF **"…"** wurde erstellt"). Matched anywhere in the text and without a
 * length bound, as before — narrowing this would change existing behaviour.
 */
const CREATION_CONFIRMATION_RE = /\bwurde erstellt\b|\beingerichtet —/;

/**
 * Openings of the fixed texts above. Anchored at the start AND length-bounded
 * on purpose: a real answer may well begin "Ich habe dir eine Übersicht
 * erstellt:" and then carry the actual content — that one must stay
 * inheritable, and it is far longer than any template here.
 */
const FIXED_TEXT_OPENING_RE =
  /^(?:Ich habe dir\b|Hier ist dein Post\b|Daraus konnte ich keinen Post\b|Diese Anfrage kann ich nicht umsetzen\b|Die Sharepic-Erstellung hat leider\b|Das hat leider nicht geklappt\b)/;

/** Longest template above is ~230 chars; the bound leaves room for wording drift. */
const MAX_FIXED_TEXT_LENGTH = 320;

/** True when the text is one of our own contentless artifact confirmations. */
export function isArtifactConfirmation(text: string): boolean {
  const trimmed = text.trim();
  if (CREATION_CONFIRMATION_RE.test(trimmed)) return true;
  return trimmed.length <= MAX_FIXED_TEXT_LENGTH && FIXED_TEXT_OPENING_RE.test(trimmed);
}
