/**
 * Post-generation check for claims the model cannot truthfully make.
 *
 * Scope is deliberately one narrow class: invented INTERNAL system artefacts.
 * In the beta test an injected payload made the assistant list
 * "GreenHackInternal_v2.pdf", "SecureComms_Override.log" and
 * "AdminCommand_2026_0727.txt" as documents it had accessed — while, asked
 * directly, it confirmed it has no file access at all. Hallucinated system
 * information is uniquely damaging for a party tool: it reads as a leak.
 *
 * Same shape as computeResultSanity: a pure function over the finished text,
 * applied at the end of the turn.
 */

/**
 * A filename whose stem carries system/access semantics. Ordinary attachments
 * ("Antrag_Radweg.pdf", "Protokoll.docx") do not match — only names that assert
 * privileged internals.
 */
const SYSTEMY_FILENAME_RE =
  /\b[\w-]*(?:internal|intern|admin|secure|override|sysconfig|credential|passwor[dt]|secret|token|zugriff|access|backdoor|hack)[\w-]*\.(?:pdf|log|txt|json|env|csv|ya?ml|ini|conf|docx?|xlsx?)\b/gi;

export interface OutputSanityResult {
  /** The answer, with any offending paragraph replaced. */
  text: string;
  /** Filenames that were rejected — for logging. */
  fabricated: string[];
}

function normalize(value: string): string {
  return value.toLowerCase();
}

/**
 * Remove claims about internal files that no real source backs.
 *
 * @param text          the generated answer
 * @param groundedText  everything the model legitimately saw this turn (source
 *                      snippets, attachment text, document titles). A filename
 *                      present here is real and must survive.
 */
export function stripFabricatedSystemClaims(
  text: string,
  groundedText: string[] = []
): OutputSanityResult {
  if (typeof text !== 'string' || text.length === 0) {
    return { text: typeof text === 'string' ? text : '', fabricated: [] };
  }

  const grounded = normalize(groundedText.join('\n'));
  const candidates = [...new Set(text.match(SYSTEMY_FILENAME_RE) ?? [])];
  const fabricated = candidates.filter((name) => !grounded.includes(normalize(name)));
  if (fabricated.length === 0) return { text, fabricated: [] };

  const fabricatedLower = fabricated.map(normalize);
  // Paragraph granularity: such names arrive as a list ("Ich habe Zugriff auf:
  // …"), so dropping the sentence alone would leave a dangling stub.
  const paragraphs = text.split(/\n{2,}/);
  const kept = paragraphs.filter(
    (p) => !fabricatedLower.some((name) => normalize(p).includes(name))
  );
  const notice =
    'Hinweis: Ich habe keinen Zugriff auf interne Dateien oder Systeme. Ein vorheriger Absatz nannte Dokumente, die es nicht gibt — er wurde entfernt.';

  return {
    text: kept.length > 0 ? `${kept.join('\n\n')}\n\n${notice}` : notice,
    fabricated,
  };
}

/**
 * The answer tells the user to go and search, although this turn already
 * searched and got sources. Observed live: two web searches + a document search
 * returned three sources naming the chancellor, and the answer closed with
 * "empfehle ich eine kurze Websuche" without ever naming him.
 *
 * Telemetry only for now — rewriting an answer on this signal alone would be
 * guesswork. It tells us how often the synth ignores its source block, which is
 * the number that decides whether the writer lane needs to change.
 */
// `(?<!\p{L})…(?!\p{L})` and `\p{L}*` rather than `\b`/bare stems. The original
// used `\b` and ended its first alternative at `such` — so "empfehle ich eine
// kurze Websuche", the exact sentence the doc comment above cites as the reason
// this check exists, never matched: `\b` sits between a word and a non-word
// character, and "such" is followed by "e". The counter read zero and looked
// like good news. Same family as the umlaut trap (`\b` is defined over `\w`,
// which excludes ä/ö/ü), so both are fixed the same way.
const DEFERS_TO_SEARCH_RE =
  /(?<!\p{L})(?:empfehle?\s+ich\s+(?:dir\s+)?eine?\s+(?:\p{L}+\s+){0,2}?(?:web|internet)?(?:such\p{L}*|recherche\p{L}*)|schau\s+(?:am\s+besten\s+)?(?:kurz\s+)?(?:im\s+netz|online|auf\s+der\s+offiziellen)|bitte\s+(?:selbst\s+)?nachschlagen|solltest\s+du\s+(?:kurz\s+)?(?:googeln|nachschlagen|recherchieren))(?!\p{L})/iu;

export function defersToSearchDespiteSources(
  text: string,
  opts: { sources: number; toolCalls: number }
): boolean {
  if (opts.sources === 0 || opts.toolCalls === 0) return false;
  return DEFERS_TO_SEARCH_RE.test(text);
}

/**
 * The answer denies being ABLE to search, in a turn where a search just ran.
 *
 * A different failure from {@link defersToSearchDespiteSources} and worth its own
 * counter: that one hands the work back to the user, this one describes the
 * product as less capable than it is. Observed live on `gemma`: "prüfe nochmal
 * im web" ran a fresh web search, returned ten sources, and the answer opened
 * with "Ich kann keine neue Websuche durchführen, da ich nur auf die bereits
 * bereitgestellten Recherche-Ergebnisse zugreifen kann" — and then cited the
 * results it had just claimed not to have.
 *
 * The cause was the synth prompt: it said the research had already run, which a
 * smaller model generalises into "I have no search tool". The prompt now forbids
 * the claim explicitly; this detector is what tells us whether that took.
 *
 * `(?<!\p{L})…(?!\p{L})` rather than `\b`: `\b` is defined over `\w`, which
 * excludes umlauts, so any alternative touching ä/ö/ü would silently never match.
 */
const DENIES_SEARCH_ABILITY_RE =
  /(?<!\p{L})ich\s+(?:kann|habe|darf)\s+(?:\p{L}+\s+){0,3}?(?:kein\p{L}*\s+(?:\p{L}+\s+){0,2}?(?:web|internet)?(?:such\p{L}*|recherche\p{L}*|internetzugriff\p{L}*|zugriff\s+auf\s+das\s+internet)|nicht\s+(?:im\s+)?(?:internet|netz|web)\s+(?:such\p{L}*|recherchier\p{L}*))|(?<!\p{L})nur\s+auf\s+die\s+(?:bereits\s+)?(?:bereitgestellten|vorliegenden|vorhandenen)\s+(?:\p{L}+\s+){0,2}?(?:ergebnisse|quellen|informationen)\s+zugreifen/iu;

export function deniesSearchAbilityDespiteSearching(
  text: string,
  opts: { sources: number; toolCalls: number }
): boolean {
  if (opts.sources === 0 || opts.toolCalls === 0) return false;
  return DENIES_SEARCH_ABILITY_RE.test(text);
}

/**
 * Whether an answer looks CUT OFF rather than finished: a completed German
 * answer ends on punctuation, so a trailing letter or digit is the signature of
 * a stream that stopped mid-sentence.
 *
 * The point of this check is WHERE it runs. The identical test also runs in the
 * chat client (`parseSSEStream`, search for "looksCutOff") over the text the
 * browser actually assembled, so the two logs together localise a truncation
 * report without a repro:
 *
 *   server suspicious + client suspicious → generation stopped early
 *                                            (pair it with finishReason)
 *   server clean      + client suspicious → the tail was lost after the server
 *                                            handed it over (transport/render)
 *
 * The live case that motivated this was the second kind — 513 chars generated,
 * 414 on screen — and it cost an entire investigation to establish, because
 * neither side said anything at all.
 */
/**
 * Fewer words than this and an unpunctuated ending says nothing: that is the
 * shape of a LABEL, not of a severed sentence.
 *
 * Empirical, not invented. A QA session asked for three literal wordings and
 * got a warning for each — "KEINE DATEN", "Korrigiert", "Klarwasser
 * gespeichert" (1–2 words), all three perfect answers — beside ONE real
 * truncation. Meanwhile the shortest cut this check exists to catch runs six
 * words ("Im Vergleich zu anderen rechtspopulistischen Pa"). Five sits in that
 * gap. It is a threshold, not a law: a cut after four words slips through, and
 * that is the price of a warning that means something when it appears.
 *
 * Mirrored in `parseSSEStream` — change both, or the cross-check between the
 * two logs stops comparing like with like.
 */
export const TRUNCATION_MIN_WORDS = 5;

export function looksCutOff(text: string): boolean {
  const trimmed = text.trimEnd();
  if (trimmed.split(/\s+/).filter(Boolean).length < TRUNCATION_MIN_WORDS) return false;
  return /[\p{L}\p{N}]$/u.test(trimmed);
}

/**
 * Whether generated user-facing text is actually a leaked TOOL CALL.
 *
 * Live: a request to look up a number and post it produced the 93-character
 * "post" `Let's search.{"query": "Grüne Sitze Bundestag Stand Juli 2026",
 * "top_n": 5, "source": "news"}` — the composer imitated the tool-call pattern
 * instead of answering, and it shipped into the post widget verbatim, exposing
 * internal prompt structure to the user.
 *
 * The agentic loop already recognises this shape (`looksDegenerateSynth`), but
 * the single-pass composers have no equivalent. Two independent signals, both
 * of which a real post never carries: a JSON object literal with a quoted key,
 * and an English "let's search"-style announcement of work to come.
 */
const JSON_ARGS_RE = /\{\s*"[a-z_]{2,}"\s*:/i;
const TOOL_ANNOUNCEMENT_RE =
  /^\s*(?:let(?:'|’)?s|i(?:'|’)?(?:ll|m going to)|now\s+i(?:'|’)?ll)\s+(?:search|look|perform|check|use|call|query|find)\b/i;

export function looksLikeToolCallLeak(text: string): boolean {
  if (typeof text !== 'string' || text.trim().length === 0) return false;
  return JSON_ARGS_RE.test(text) || TOOL_ANNOUNCEMENT_RE.test(text);
}
