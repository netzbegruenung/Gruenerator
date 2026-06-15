/**
 * Pure routing heuristics for the chat reel-edit branch (no heavy imports —
 * unit-testable). Same Unicode-lookbehind technique as
 * sharepicEditHeuristics.ts: JS `\b` only knows ASCII word characters, so
 * `\bänder...` never matches — "ä" is not \w. Suffixes stay prefix-matched.
 */

const EDIT_VERB_PATTERN =
  /(?<!\p{L})(änder|aender|anpass|korrigier|verbesser|kürz|kuerz|verläng|verlaeng|umformulier|formulier|ersetz|umschreib|schreib|mach|fix|entfern|lösch|loesch|tipp?fehler|rechtschreib|gender)/iu;

/**
 * Reel-specific nouns. `untertitel|reel|caption|subtitle` are strong signals
 * (never shared with sharepics); `segment N` and "video text" are generic —
 * the service only claims the turn for those when a reel target exists.
 */
const STRONG_REEL_NOUN_PATTERN = /(?<!\p{L})(untertitel|subtitle|reels?|captions?)/iu;

const REEL_NOUN_PATTERN =
  /(?<!\p{L})(untertitel|subtitle|reels?|captions?|segmente?s?\s*\d*|video.?text)/iu;

/** Phrases that mean "create a new reel/video" — never treated as an edit. */
const NEW_REEL_PATTERN =
  /(?<!\p{L})(neue?s?\s+(reel|video)|erstell\w*\s+(ein\s+)?(reel|video)(?!\s*-?\s*(untertitel|text)))/iu;

/**
 * Content-creation requests ABOUT the reel ("schreib mir einen Insta-Post
 * dazu", "fass das Video zusammen") — never subtitle edits. These must fall
 * through to the normal pipeline, which has the reel transcript injected as
 * context (see buildReelContextBlock) and can actually write the post.
 * Checked before the verb patterns because "schreib"/"mach" overlap.
 */
const SOCIAL_CONTENT_PATTERN =
  /(?<!\p{L})(post|beitrag|tweet|story|stories|hook|zusammenfass|beschreibungs?text|bildunterschrift|instagram|insta|facebook|linkedin|tiktok|bluesky|mastodon|threads|newsletter|presse)/iu;

/**
 * True when the message reads like a subtitle edit instruction for a reel
 * ("Korrigiere die Tippfehler in den Untertiteln", "Untertitel meines Reels
 * anpassen"). Whether a reel target actually exists is the service's job.
 */
export function isReelEditInstruction(text: string): boolean {
  if (NEW_REEL_PATTERN.test(text) || SOCIAL_CONTENT_PATTERN.test(text)) return false;
  return EDIT_VERB_PATTERN.test(text) && REEL_NOUN_PATTERN.test(text);
}

/**
 * True when the reel-noun match is one of the strong, reel-only nouns. Used
 * for the fall-through rule: without any reel context, a generic-noun match
 * ("Segment 2 kürzen") falls through to the sharepic branch instead of
 * claiming the turn.
 */
export function hasStrongReelNoun(text: string): boolean {
  return STRONG_REEL_NOUN_PATTERN.test(text);
}

/**
 * Relaxed check for active Reel-Modus: with a reel attached to the thread,
 * an edit verb alone is enough ("mach das kürzer", "korrigier das") — the
 * follow-up usually drops the noun.
 */
export function hasReelEditVerb(text: string): boolean {
  if (NEW_REEL_PATTERN.test(text) || SOCIAL_CONTENT_PATTERN.test(text)) return false;
  return EDIT_VERB_PATTERN.test(text);
}
