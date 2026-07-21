/**
 * Pure routing heuristics for the EXPERIMENTAL social-post TEXT edit branch
 * (no heavy imports — unit-testable). Sibling of sharepicEditHeuristics.
 *
 * The disambiguation problem: the sharepic EDIT_NOUN_PATTERN contains `text`,
 * so "mach den Text knackiger" was hijacked by the sharepic edit branch
 * before this feature. Router precedence (chatGraphContractRouter):
 *   1. `currentSharepic` set (Sharepic-Modus) → sharepic edit wins, this
 *      branch is skipped entirely.
 *   2. This check, on threads whose latest post exists: text-ish instruction
 *      → text edit.
 *   3. Everything else (sharepic-specific nouns like "Zeile 2") falls
 *      through to the sharepic edit path unchanged.
 *
 * Same Unicode-lookbehind idiom as sharepicEditHeuristics: JS `\b` only
 * knows ASCII word chars, so umlaut-initial words ("ändere") need
 * `(?<!\p{L})` instead.
 */

const TEXT_EDIT_VERB_PATTERN =
  /(?<!\p{L})(änder|aender|mach|kürz|kuerz|verläng|verlaeng|umformulier|formulier|überarbeit|ueberarbeit|verbesser|anpass|ergänz|ergaenz|entfern|streich|ersetz|schreib)/iu;

/**
 * Text-ish nouns. Deliberately excludes `untertext`/`zusatztext` (sharepic
 * template fields — the lookbehind rejects them since "text" is preceded by
 * a letter there).
 */
const TEXT_NOUN_PATTERN =
  /(?<!\p{L})(text|posts?|posting|caption|beitrag|hashtags?|emojis?|tonalität|tonalitaet|wording|cta|call-to-action)(?!\p{L})/iu;

/**
 * Pure tone adjustments that clearly target prose even without a noun
 * ("mach es knackiger", "etwas emotionaler bitte").
 */
const TONE_WORD_PATTERN =
  /(?<!\p{L})(knackiger|emotionaler|sachlicher|lockerer|förmlicher|foermlicher|freundlicher|kürzer|kuerzer|länger|laenger|prägnanter|praegnanter|zugespitzter|professioneller|persönlicher|persoenlicher|witziger|ernster)(?!\p{L})/iu;

/**
 * Sharepic-specific nouns: the instruction targets the graphic, never the
 * post text. Superset of the visual fields in sharepicEditHeuristics'
 * EDIT_NOUN_PATTERN minus `text` itself.
 */
const SHAREPIC_SPECIFIC_NOUN_PATTERN =
  /(?<!\p{L})(zeile\s*\d*|balken|schrift\w*|font|farb\w*|hintergrund\w*|bild\w*|foto\w*|motiv|sonnenblume|logo|überschrift|ueberschrift|header|sharepics?|varianten?|slides?|folien?|seite\s*\d*|karussell|slider|deck|cover|headline|untertext|zusatztext|label|grafik\w*)/iu;

/** "Schreib einen NEUEN Post zu Y" is a fresh creation, never an edit. */
const NEW_POST_PATTERN =
  /(?<!\p{L})(neuen?\s+(post|tweet|beitrag|caption)|noch\s+ein(en)?\s+(post|tweet|beitrag)|(post|tweet|beitrag|caption)\s+(zu[rm]?|über|ueber|für|fuer)(?!\p{L}))/iu;

/**
 * True when the message reads like an edit instruction for the TEXT of an
 * existing social post. Only meaningful when the thread actually has a
 * social_post message — callers check target existence first.
 */
export function isSocialTextEditInstruction(text: string): boolean {
  if (NEW_POST_PATTERN.test(text)) return false;
  if (SHAREPIC_SPECIFIC_NOUN_PATTERN.test(text)) return false;
  if (TEXT_EDIT_VERB_PATTERN.test(text) && TEXT_NOUN_PATTERN.test(text)) return true;
  return TONE_WORD_PATTERN.test(text);
}
