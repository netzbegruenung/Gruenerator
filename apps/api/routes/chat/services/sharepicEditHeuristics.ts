/**
 * Pure routing heuristics for the sharepic edit branch (no heavy imports —
 * unit-testable). GOTCHA that motivated this file: JS `\b` only knows ASCII
 * word characters, so `\bänder...` NEVER matches ("ä" is not \w — there is no
 * boundary between a space and "ä"). Umlaut-initial verbs like "ändere" and
 * nouns like "überschrift" silently failed for the entire pattern's lifetime.
 * We use Unicode lookbehind instead of \b; suffixes stay prefix-matched
 * (the old `\w*` behavior, now including umlaut continuations).
 */

const EDIT_VERB_PATTERN =
  /(?<!\p{L})(änder|aender|mach|verschieb|beweg|setz|tausch|ersetz|wechsel|vergrößer|vergroesser|verklein|größer|groesser|kleiner|höher|hoeher|tiefer|kürz|kuerz|verläng|verlaeng|anpass|entfern|ausblend|einblend|zeig|versteck|nach\s+(?:oben|unten|links|rechts)|anderes?|neues?)/iu;

const EDIT_NOUN_PATTERN =
  /(?<!\p{L})(zeile\s*[123]?|text|balken|schrift|font|farb|hintergrund|bild|foto|motiv|sonnenblume|logo|zitat|überschrift|ueberschrift|header|sharepic|variante)/iu;

/** Phrases that mean "generate fresh variants" — never treated as an edit. */
const NEW_VARIANTS_PATTERN =
  /(?<!\p{L})(neue?s?\s+(sharepic|varianten?)|noch\s*mal\s+(neu|von\s+vorn)|alle\s+varianten|drei\s+varianten)/iu;

/**
 * True when the message reads like an edit instruction for an existing
 * sharepic (vs. a request for a fresh one). Only meaningful when the thread
 * actually has a sharepic to edit — callers check target existence.
 */
export function isSharepicEditInstruction(text: string): boolean {
  if (NEW_VARIANTS_PATTERN.test(text)) return false;
  return EDIT_VERB_PATTERN.test(text) && EDIT_NOUN_PATTERN.test(text);
}

/**
 * Relaxed check for the active Sharepic-Modus: with a variant explicitly
 * marked "Im Chat bearbeiten", an edit verb alone is enough intent signal
 * ("setze ein", "mach das rein") — requiring a noun too is what made the
 * mode feel deaf. Used only on the agentic-loop path, which can answer with
 * plain text when the message turns out not to be sharepic-related.
 */
export function hasSharepicEditVerb(text: string): boolean {
  if (NEW_VARIANTS_PATTERN.test(text)) return false;
  return EDIT_VERB_PATTERN.test(text);
}

const AFFIRMATION_PATTERN =
  /^(ja|yes|yep|jup|jo|ok(ay)?|passt( so)?|gerne?|genau( so)?|perfekt|super|top|mach( das| es)?( so)?|so umsetzen|setz(e)?( das)?( so)? um|übernimm( das)?|übernehmen|einsetzen|bitte)([.!,\s]+(ja|yes|ok(ay)?|passt|gerne?|genau|bitte|mach( das| es)?( so)?|so|um(setzen)?|das))*[.!\s]*$/iu;

/**
 * Short confirmations ("ja", "yes", "mach das so") right after the assistant
 * proposed an edit. Only consulted in active Sharepic-Modus on the loop path —
 * the loop sees the prior assistant reply, so it can apply what was proposed.
 */
export function isShortAffirmation(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > 40) return false;
  return AFFIRMATION_PATTERN.test(trimmed);
}
