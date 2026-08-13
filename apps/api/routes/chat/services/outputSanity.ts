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
 *
 * `intern(?!et)` and `hack(?!athon)`: both markers are the PREFIX of an
 * everyday German word, and this guard does not warn — it deletes the whole
 * paragraph and replaces it with "Ich habe keinen Zugriff auf interne Dateien".
 * "Internetkonzept.pdf" and "Hackathon_Doku.pdf" are ordinary party documents.
 * `admin` keeps no exception on purpose: "Administrator…" is the very semantics
 * the guard is looking for.
 */
const SYSTEMY_FILENAME_RE =
  /\b[\w-]*(?:internal|intern(?!et)|admin|secure|override|sysconfig|credential|passwor[dt]|secret|token|zugriff|access|backdoor|hack(?!athon))[\w-]*\.(?:pdf|log|txt|json|env|csv|ya?ml|ini|conf|docx?|xlsx?)\b/gi;

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
 *                      snippets, attachment text, document titles, AND the
 *                      user's own message). A filename present here is real and
 *                      must survive — a name the user typed themselves cannot
 *                      be one the model invented, and echoing it back is the
 *                      normal way to answer "was steht in X?".
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
 * A `data:` URI carrying a DOCUMENT payload. Image mime types are deliberately
 * absent: an inline `data:image/svg+xml` inside an `artifact` turn's HTML block
 * is legitimate content, while there is no turn in this product where the
 * assistant should type out an Office file, a PDF or a ZIP.
 *
 * Bounded on purpose — the point is to RECOGNISE the block, not to consume it;
 * removal happens at fence/paragraph granularity below.
 */
const DOCUMENT_DATA_URI_RE =
  /data:application\/(?:vnd\.(?:openxmlformats-officedocument|oasis\.opendocument|ms-)[^\s;,]*|pdf|zip|x-zip-compressed|octet-stream|msword)\s*;\s*base64,[A-Za-z0-9+/=]{16}/i;

/**
 * An artefact path with a UUID in it, with or without a host in front. The
 * UUID shape is the whole gate: a Notion-style slug path carries a name prefix
 * and cannot collide, and a bare `/office/` with no id is prose, not a promise.
 */
const ARTIFACT_PATH_RE =
  /(?:https?:\/\/[^\s)\]]*?)?\/(?:office|docs?|documents|boards?|sheets?|presentations?)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;

const FENCED_BLOCK_RE = /```[\s\S]*?(?:```|$)/g;

export interface ArtifactDeliveryResult {
  text: string;
  /** What was removed — for logging. Empty means the text was left untouched. */
  removed: string[];
}

/**
 * Remove a FILE the model typed out and a PATH it made up.
 *
 * Live on 02.08.2026, both in the same thread. Asked for a presentation on a
 * turn whose artefact action was forbidden, the model wrote
 * `data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,…`
 * into the chat and told the user to save it as `.pptx` — 252 bytes, a ZIP
 * header, no central directory, no end-of-archive: not a file. Told that it was
 * broken, it answered with the bare path `/office/7f9a3c2b-1e45-4d8a-b6fa-0c2e5b9d4e12`,
 * an id nothing had ever minted, and the click 404'd in the access log.
 *
 * Both failures share a shape the prompt cannot fully close: they are the
 * model's idea of being helpful when the tool it needed was not mounted. So the
 * prompt states the rule ({@link NO_HANDMADE_FILE_NOTE}) and this states the
 * guarantee.
 *
 * `knownRefs` is the allowlist — the ids of artefacts this thread really built.
 * A path the CODE handed the model (`/boards/<id>` in the agentic loop's board
 * note) is in there and survives; an invented one is not and does not.
 *
 * Deliberately NOT total: a sentence like "speichere den Block als .pptx" may
 * outlive the block it referred to, because the sentence carries no signature to
 * key on. Removing the payload is what makes the answer honest; the leftover
 * reads as a mistake rather than as a broken download.
 */
export function stripFabricatedArtifactDelivery(
  text: string,
  knownRefs: readonly (string | null | undefined)[] = []
): ArtifactDeliveryResult {
  if (typeof text !== 'string' || text.length === 0) {
    return { text: typeof text === 'string' ? text : '', removed: [] };
  }

  const allowed = new Set(
    knownRefs
      .filter((ref): ref is string => typeof ref === 'string' && ref.length > 0)
      .map(normalize)
  );
  const removed: string[] = [];

  const fabricatedPath = (segment: string): string | null => {
    for (const m of segment.matchAll(ARTIFACT_PATH_RE)) {
      const id = m[1];
      if (id && !allowed.has(normalize(id))) return m[0];
    }
    return null;
  };

  const offence = (segment: string): string | null => {
    if (DOCUMENT_DATA_URI_RE.test(segment)) return 'data:-Block';
    return fabricatedPath(segment);
  };

  // Fenced blocks first: a base64 payload arrives inside one, and its blank
  // lines would otherwise split it across several "paragraphs", leaving half
  // the blob standing.
  let out = text.replace(FENCED_BLOCK_RE, (block) => {
    const found = offence(block);
    if (!found) return block;
    removed.push(found);
    return '';
  });

  out = out
    .split(/\n{2,}/)
    .filter((paragraph) => {
      const found = offence(paragraph);
      if (!found) return true;
      removed.push(found);
      return false;
    })
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (removed.length === 0) return { text, removed: [] };

  const notice =
    'Hinweis: Ich kann eine Datei nicht selbst in die Antwort schreiben — ein Teil dieser Antwort behauptete das und wurde entfernt. Präsentationen, Dokumente, Tabellen und PDFs lege ich über die Erstellungsfunktion an; sie erscheinen dann als Karte im Chat. Sag Bescheid, dann mache ich das.';

  return { text: out.length > 0 ? `${out}\n\n${notice}` : notice, removed };
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
 * The chat-template control tokens with which the open-weight models wrap a
 * tool call. They are protocol, never content: the SDK parses real ones out of
 * the stream long before the text reaches here, so an occurrence in the answer
 * text is always an imitation the model typed as prose.
 *
 * Live 13.08.2026, four turns in a row: the split writer runs WITHOUT tools but
 * WITH the gather phase's tool transcript in its context, and opened three of
 * four answers with a bare `<tool_call>` before writing perfectly good German.
 * The existing guards all missed it — `looksLikeToolPlanLeak` only fires when
 * the WHOLE answer is short and plan-shaped, and here the answer was 1.866
 * correct characters behind one stray token.
 *
 * Deleted, not retried: everything after it was fine, and re-rolling a good
 * answer over one token would cost the user a second wait for no gain.
 */
const CONTROL_TOKEN_RE =
  /<\/?(?:tool_call|tool_calls|tool_response|tool_result|function_call|\|?(?:tool_calls|im_start|im_end)\|?)>/gi;

/**
 * Strip those tokens — outside fenced code only.
 *
 * The fence exception is the whole reason this is not a bare `.replace()`: "wie
 * sieht ein tool_call im Chat-Template aus?" is a legitimate question about this
 * product, and its answer shows the token inside a fence. Odd-indexed segments
 * of a ```-split ARE the fenced bodies, so they pass through untouched.
 */
export function stripToolControlTokens(text: string): string {
  if (typeof text !== 'string' || text.length === 0) return text ?? '';
  CONTROL_TOKEN_RE.lastIndex = 0;
  if (!CONTROL_TOKEN_RE.test(text)) return text;
  return text
    .split('```')
    .map((segment, i) => (i % 2 === 0 ? segment.replace(CONTROL_TOKEN_RE, '') : segment))
    .join('```');
}

/** Das längste Token oben (`<tool_response>`, `<function_call>`) misst 15 Zeichen. */
const MAX_CONTROL_TOKEN_CHARS = 15;

/**
 * Dieselbe Säuberung, aber über einen Strom aus Teilstücken.
 *
 * `stripToolControlTokens` bekam den ganzen Text und war deshalb nur dort
 * anwendbar, wo einer vorliegt: auf dem gesammelten Ergebnis und im 200-Zeichen-
 * Haltefenster des Antwort-Gitters. Der Kommentar dort behauptete, das Token
 * komme „immer als Erstes, vor jeder Prosa" — eine Annahme, keine Messung.
 * Gemessen am 13.08.2026: Turn 1 lief mit einem Werkzeugschritt, und das Token
 * erschien erneut, obwohl der Filter ausgeliefert war. Sobald das Gitter offen
 * ist, geht jedes Delta ungeprüft durch.
 *
 * Zwei Dinge kann ein Stück-für-Stück-Filter nicht naiv: ein Token kann über die
 * Grenze zweier Deltas zerfallen (`<tool` + `_call>`), und die Ausnahme für
 * Code-Zäune braucht Gedächtnis über Stücke hinweg. Deshalb hält dieser Filter
 * die letzten {@link MAX_CONTROL_TOKEN_CHARS} Zeichen zurück, bis mehr kommt
 * (die Verzögerung ist eine Bildschirmbreite), und trägt die Zaun-Tiefe mit.
 */
export function createControlTokenFilter(): {
  push: (chunk: string) => string;
  flush: () => string;
} {
  let carry = '';
  let insideFence = false;

  const scrub = (text: string): string => {
    let out = '';
    let rest = text;
    for (;;) {
      const at = rest.indexOf('```');
      if (at === -1) {
        out += insideFence ? rest : rest.replace(CONTROL_TOKEN_RE, '');
        return out;
      }
      const head = rest.slice(0, at);
      out += insideFence ? head : head.replace(CONTROL_TOKEN_RE, '');
      out += '```';
      insideFence = !insideFence;
      rest = rest.slice(at + 3);
    }
  };

  return {
    push(chunk) {
      if (typeof chunk !== 'string' || chunk.length === 0) return '';
      const combined = carry + chunk;

      // Zurückgehalten wird, was ANGEFANGEN aussieht — nicht eine feste Länge.
      // Eine feste Länge zerschnitt ein bereits vollständiges Token beim
      // nächsten Stück wieder (`<tool_call>` landete im Rest, die Hälfte davon
      // ging beim übernächsten Push raus). Ein Test hat das gefangen.
      let cut = combined.length;

      // Ein `<` ohne schließendes `>` in Reichweite: kann der Anfang sein.
      const lt = combined.lastIndexOf('<');
      if (
        lt !== -1 &&
        combined.indexOf('>', lt) === -1 &&
        combined.length - lt < MAX_CONTROL_TOKEN_CHARS
      ) {
        cut = lt;
      }

      // Ein bis zwei Backticks am Ende: könnte ein angefangener Zaun sein, und
      // die Zaun-Ausnahme entscheidet, ob überhaupt gesäubert wird.
      let ticks = 0;
      while (ticks < 3 && combined[combined.length - 1 - ticks] === '`') ticks++;
      if (ticks > 0 && ticks < 3) cut = Math.min(cut, combined.length - ticks);

      carry = combined.slice(cut);
      return scrub(combined.slice(0, cut));
    },
    flush() {
      const out = scrub(carry);
      carry = '';
      return out;
    },
  };
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
 * The agentic loop already recognises this shape (`looksLikeToolPlanLeak`), but
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

/**
 * Whether an answer that PRESENTS itself as JSON is actually parseable.
 *
 * QA finding (2026-08): a JSON-extraction turn shipped `[{…"stunden": ,{…` —
 * visibly broken, and worthless for the copy-paste use the user asked for.
 * Checked are only the shapes that unambiguously claim to be JSON: fenced
 * ```json blocks (an unterminated fence counts — that IS the truncation case),
 * unlabelled fences whose body starts with `{`/`[`, and an answer whose whole
 * trimmed text starts with `{`/`[`. Prose that merely contains JSON-ish
 * fragments is out of scope on purpose — no reliable delimiter, and a false
 * positive here costs a needless model call.
 */
export function containsBrokenJsonPayload(text: string): boolean {
  const t = (text ?? '').trim();
  if (t.length === 0) return false;
  const candidates: string[] = [];
  const fenceRe = /```(\w*)[ \t]*\r?\n?([\s\S]*?)(?:```|$)/g;
  let sawFence = false;
  for (let m = fenceRe.exec(t); m != null; m = fenceRe.exec(t)) {
    sawFence = true;
    const lang = (m[1] ?? '').toLowerCase();
    const body = (m[2] ?? '').trim();
    if (lang === 'json' || (lang === '' && /^[[{]/.test(body))) candidates.push(body);
    if (fenceRe.lastIndex === t.length) break;
  }
  if (!sawFence && /^[[{]/.test(t)) candidates.push(t);
  return candidates.some((c) => {
    if (c.length === 0) return true;
    try {
      JSON.parse(c);
      return false;
    } catch {
      return true;
    }
  });
}
