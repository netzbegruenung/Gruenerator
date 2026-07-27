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
const DEFERS_TO_SEARCH_RE =
  /\b(?:empfehle?\s+ich\s+(?:dir\s+)?eine?\s+(?:kurze\s+)?(?:web)?(?:such|recherche)|schau\s+(?:am\s+besten\s+)?(?:kurz\s+)?(?:im\s+netz|online|auf\s+der\s+offiziellen)|bitte\s+(?:selbst\s+)?nachschlagen|solltest\s+du\s+(?:kurz\s+)?(?:googeln|nachschlagen|recherchieren))\b/i;

export function defersToSearchDespiteSources(
  text: string,
  opts: { sources: number; toolCalls: number }
): boolean {
  if (opts.sources === 0 || opts.toolCalls === 0) return false;
  return DEFERS_TO_SEARCH_RE.test(text);
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
export function looksCutOff(text: string): boolean {
  return /[\p{L}\p{N}]$/u.test(text.trimEnd());
}
