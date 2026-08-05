/**
 * Pure routing heuristics for the sharepic edit branch (no heavy imports —
 * unit-testable). GOTCHA that motivated this file: JS `\b` only knows ASCII
 * word characters, so `\bänder...` NEVER matches ("ä" is not \w — there is no
 * boundary between a space and "ä"). Umlaut-initial verbs like "ändere" and
 * nouns like "überschrift" silently failed for the entire pattern's lifetime.
 * We use Unicode lookbehind instead of \b; suffixes stay prefix-matched
 * (the old `\w*` behavior, now including umlaut continuations).
 */

// `ergänz`/`hinzufüg`/`einfüg` are ADD verbs, and their absence was a hole, not
// a scope decision: "Und jetzt noch die Uhrzeit 15 Uhr ergänzen" after a
// sharepic matched no edit verb anywhere, so neither the classifier's Tier 2.7
// branch nor either of the router's two edit lanes claimed it. The turn ended as
// a plain text answer and the sharepic was never touched. Adding to an existing
// artifact is an edit by any reading — the pattern simply only knew how to
// CHANGE and to REMOVE.
const EDIT_VERB_PATTERN =
  /(?<!\p{L})(änder|aender|mach|verschieb|beweg|setz|tausch|ersetz|wechsel|vergrößer|vergroesser|verklein|größer|groesser|kleiner|höher|hoeher|tiefer|kürz|kuerz|verläng|verlaeng|anpass|entfern|ausblend|einblend|zeig|versteck|ergänz|ergaenz|hinzufüg|hinzufueg|einfüg|einfueg|nach\s+(?:oben|unten|links|rechts)|anderes?|neues?)/iu;

// `uhrzeit`/`datum` for the same reason: an invitation sharepic is exactly the
// template where they are the fields being edited. Kept to the two unambiguous
// nouns — a bare `zeit` would match "Zeitung", "zur Zeit", "Zeitpunkt".
const EDIT_NOUN_PATTERN =
  /(?<!\p{L})(zeile\s*[123]?|text|balken|schrift|font|farb|hintergrund|bild|foto|motiv|sonnenblume|logo|zitat|überschrift|ueberschrift|header|sharepic|variante|slides?|folien?|seite\s*\d*|karussell|slider|deck|cover|abschluss(folie)?|headline|untertext|zusatztext|label|uhrzeit|datum)/iu;

/** Phrases that mean "generate fresh variants" — never treated as an edit. */
const NEW_VARIANTS_PATTERN =
  /(?<!\p{L})(neue?[sn]?\s+(sharepic|varianten?|karussell|slider)|noch\s*mal\s+(neu|von\s+vorn)|alle\s+varianten|drei\s+varianten)/iu;

/**
 * The message asks for a NEW document-level artifact, so it is a creation turn
 * even when it also carries edit wording.
 *
 * Live failure: "Schreib einen Instagram-Post UND eine Pressemitteilung zum
 * Thema Windkraft. Kürze danach nur die Pressemitteilung." produced NO content
 * at all — "Kürze" alone satisfied the refinement pattern, the turn was routed
 * into the sharepic edit branch, and the user got "Welche Variante soll ich
 * bearbeiten?" for artifacts that had nothing to do with the request.
 *
 * `NEW_VARIANTS_PATTERN` above does not cover this: it only knows "neues
 * Sharepic / neue Varianten", not "erstelle mir ein anderes Artefakt".
 *
 * Same indefinite-article idiom as the social-post branch
 * (INDEFINITE_NEW_POST_PATTERN): an indefinite article before a
 * document-level noun means creation, a definite one means edit. The noun list
 * deliberately holds ONLY whole artifacts — sharepic-internal fields ("ein
 * anderes Bild", "eine neue Zeile") must stay editable.
 */
const NEW_ARTIFACT_PATTERN =
  /(?<!\p{L})ein(?:en|em|e)?(?!\p{L})[^.!?;]{0,40}?(?:post(?:ing)?|tweet|beitrag|caption|pressemitteilung|presseerkl(?:ä|ae)rung|rede|antrag|pr(?:ä|ae)sentation|tabelle|dokument|newsletter)(?!\p{L})/iu;

/**
 * Whether the message requests a new artifact rather than a change to an
 * existing one. Exported so the sharepic REFINEMENT check (which lives with the
 * variant helpers) applies the same rule — both entry points into the edit
 * branch have to agree, or the fix only closes one of two doors.
 */
export function asksForNewArtifact(text: string): boolean {
  return NEW_ARTIFACT_PATTERN.test(text);
}

/**
 * A question ABOUT the content ("stimmt das?", "bist du sicher?") rather than a
 * request to change it. Blocks every door into the edit branch — live, a user
 * questioning a fact got "Welche Variante soll ich bearbeiten?" instead of an
 * answer, and the turn ended there.
 *
 * A bare "?" test would be wrong and was rejected for that reason: "Kannst du
 * die Überschrift kürzen?" is a question in form and an instruction in intent,
 * and half of all polite edit requests look like that. What separates the two
 * is the verification vocabulary — stimmt / sicher / korrekt / Quelle — not the
 * punctuation. Both are required: "das stimmt so nicht, kürz es" is a
 * correction WITH an instruction and must keep working.
 */
const VERIFICATION_QUESTION_PATTERN =
  /(?<!\p{L})(stimmt\s+(?:das|die|der|es)|bist\s+du\s+(?:dir\s+)?sicher|sicher,?\s+dass|ist\s+(?:das|die|der|dies|diese[rs]?)\b[^?]{0,40}?(?:wirklich|korrekt|richtig|wahr|belegt|erfunden)|hast\s+du\s+(?:dir\s+)?(?:das|die|den)\b[^?]{0,30}?(?:erfunden|ausgedacht)|wo(?:her)?\s+(?:hast\s+du|kommt|stammt)|welche\s+quelle|gibt\s+es\s+(?:daf(?:ü|ue)r|dazu)\s+(?:eine\s+)?(?:quelle|beleg))/iu;

export function isVerificationQuestion(text: string): boolean {
  return text.includes('?') && VERIFICATION_QUESTION_PATTERN.test(text);
}

/**
 * True when the message reads like an edit instruction for an existing
 * sharepic (vs. a request for a fresh one). Only meaningful when the thread
 * actually has a sharepic to edit — callers check target existence.
 */
export function isSharepicEditInstruction(text: string): boolean {
  if (NEW_VARIANTS_PATTERN.test(text)) return false;
  if (NEW_ARTIFACT_PATTERN.test(text)) return false;
  if (isVerificationQuestion(text)) return false;
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
  if (isVerificationQuestion(text)) return false;
  return EDIT_VERB_PATTERN.test(text);
}

// The trailing group is bounded rather than `*`: unbounded, it backtracks
// exponentially on "jo so mach so mach …" (38 ms at 163 characters, doubling
// every 16 — CodeQL js/redos). `isShortAffirmation` caps the input at 40
// characters, where the head costs 2 and every repetition at least 3, so 13 is
// past anything reachable and the bound is unobservable — but the cap now lives
// in the pattern too, instead of only in its one caller.
const AFFIRMATION_PATTERN =
  /^(ja|yes|yep|jup|jo|ok(ay)?|passt( so)?|gerne?|genau( so)?|perfekt|super|top|mach( das| es)?( so)?|so umsetzen|setz(e)?( das)?( so)? um|übernimm( das)?|übernehmen|einsetzen|bitte)([.!,\s]+(ja|yes|ok(ay)?|passt|gerne?|genau|bitte|mach( das| es)?( so)?|so|um(setzen)?|das)){0,13}[.!\s]*$/iu;

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
