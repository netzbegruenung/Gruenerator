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
 * The answer asks the person to WAIT for the assistant's own work — which never
 * comes, nothing runs after a turn ends (live 15.09.2026: "wird in diesem
 * Moment generiert … Moment bitte"). Bound to first-person / generation
 * idioms; "erscheint in Kürze", "bitte warten", "wird gerade bearbeitet" are
 * ordinary content ("Laut [1] erscheint der Bericht in Kürze") and stay out.
 */
const PENDING_WORK_RE =
  /(?<!\p{L})(?:moment\s+bitte|einen\s+(?:kurzen\s+)?augenblick|ich\s+melde\s+mich\s+gleich|wird\s+(?:gerade|jetzt|soeben|in\s+diesem\s+moment)\s+(?:erstellt|generiert|erzeugt|gerendert)|erscheint\s+gleich|sobald\s+(?:der\s+vorgang|die\s+erstellung|die\s+generierung)\s+abgeschlossen)(?!\p{L})/iu;

export function announcesPendingWork(text: string): boolean {
  return PENDING_WORK_RE.test(text);
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

/**
 * „Ich habe mir das notiert." ohne `memory`-Schritt (#3914, beta 30.09.2026,
 * steps=0): der Schreiber behauptete eine Speicherung, die nie lief, obwohl die
 * Regel im Prompt stand. Wie bei den anderen Wächtern hier entscheidet der
 * fertige Text — Satzgrenze, nie die ganze Antwort.
 *
 * Eng gehalten: `notiert`/`gemerkt` und „merke mir" sind Erinnerungs-Sprache.
 * „gespeichert" ist es nur mit Pronomen-Objekt („das", „es", „diese
 * Information") UND nur auf einem Turn ganz ohne Schritte — sonst kann es ein
 * Dokument meinen, das ein Werkzeug wirklich angelegt hat.
 */
const MEMORY_NOTE_CLAIM_RE =
  /(?<!\p{L})(?:ich\s+habe\s+(?:mir\s+)?(?:(?:das|es|dies|alles|die|diese|deine?)\s+(?:\p{L}+\s+)?)?(?:notiert|gemerkt)|das\s+habe\s+ich\s+(?:mir\s+)?(?:notiert|gemerkt)|ich\s+(?:merke|notiere)\s+(?:mir\s+)?(?:das|es|dies|alles)|(?:das|es)\s+(?:werde|will)\s+ich\s+(?:mir\s+)?(?:merken|notieren)|ich\s+werde\s+(?:mir\s+)?(?:das|es|dies)\s+(?:merken|notieren))(?!\p{L})/iu;
const MEMORY_SAVED_CLAIM_RE =
  /(?<!\p{L})ich\s+habe\s+(?:(?:das|es|dies|alles|diese\s+(?:information|angabe)\p{L}*|die\s+(?:information|angabe|zahl|korrektur)\p{L}*)\s+)(?:\p{L}+\s+)?gespeichert(?!\p{L})/iu;

export const PHANTOM_NOTE_FALLBACK = 'Danke für die Information.';

export function stripPhantomMemoryClaim(
  text: string,
  turn: { memoryRan: boolean; stepCount: number }
): { text: string; removed: string[] } {
  if (typeof text !== 'string' || text.length === 0 || turn.memoryRan) {
    return { text: typeof text === 'string' ? text : '', removed: [] };
  }
  const removed: string[] = [];
  // Ungerade Einträge sind Trenner (Leerraum nach Satzende oder Zeilenumbruch);
  // sie bleiben erhalten, damit Absätze und Listen heil bleiben.
  const parts = text.split(/((?<=[.!?])[ \t]+|\s*\n\s*)/);
  let out = '';
  let pendingSep = '';
  for (let i = 0; i < parts.length; i += 2) {
    const sentence = parts[i];
    const sep = parts[i + 1] ?? '';
    const hit =
      MEMORY_NOTE_CLAIM_RE.test(sentence) ||
      (turn.stepCount === 0 && MEMORY_SAVED_CLAIM_RE.test(sentence));
    if (hit) {
      removed.push(sentence.trim());
      // Der Trenner des Satzes entfällt mit ihm; der stärkere hält die Nachbarn zusammen.
      pendingSep = strongerSeparator(pendingSep, sep);
      continue;
    }
    out += pendingSep + sentence;
    pendingSep = sep;
  }
  if (removed.length === 0) return { text, removed };
  out = out.trim();
  return { text: out.length > 0 ? out : PHANTOM_NOTE_FALLBACK, removed };
}

/** Beim Streichen eines Satzes bleibt der stärkere Trenner — sonst klebt der
 *  nächste Absatz (eine Tabelle, eine Liste) an der vorigen Zeile. */
function strongerSeparator(kept: string, dropped: string): string {
  const breaks = (sep: string) => (sep.match(/\n/g) ?? []).length;
  return breaks(dropped) > breaks(kept) ? dropped : kept;
}

/**
 * „Ich habe dir das Sharepic überarbeitet." ohne Sharepic-Werkzeug im Turn.
 * Live 11.10.2026 antworteten sechs von sechs Aufträgen, die keine
 * Bearbeitungstür nahm, mit genau dieser Floskel echter Revisionen aus dem
 * Verlauf — ohne Karte. Prompt-Regel und `SHAREPIC_EDIT_HINT` hielten
 * mistral-medium nicht davon ab; der fertige Text entscheidet, Satz für Satz.
 *
 * Eng gehalten: Ich-Perfekt mit Sharepic-Nomen im selben Satz. „Ich habe den
 * Text überarbeitet" bleibt — das kann eine Textantwort meinen.
 */
const EDIT_CLAIM_VERBS =
  'überarbeitet|ueberarbeitet|angepasst|geändert|geaendert|aktualisiert|ersetzt|umgesetzt|' +
  'verschoben|sortiert|gelöscht|geloescht|entfernt|hinzugefügt|hinzugefuegt|ergänzt|ergaenzt|' +
  'eingefügt|eingefuegt|gekürzt|gekuerzt|umbenannt|formatiert|eingetragen|angelegt';

// Im Passiv nur Handlungen, keine Zustände: „Die Tabelle ist nach Einwohnern
// sortiert" beschreibt sie, „Folie 4 wurde gelöscht" behauptet eine Änderung.
const PASSIVE_CLAIM_VERBS =
  'überarbeitet|ueberarbeitet|geändert|geaendert|aktualisiert|ersetzt|verschoben|gelöscht|geloescht|' +
  'entfernt|hinzugefügt|hinzugefuegt|ergänzt|ergaenzt|eingefügt|eingefuegt|gekürzt|gekuerzt|umbenannt|eingetragen';

/** Ein Artefakt, dessen Änderung eine Antwort behaupten kann. */
export type EditableArtifactKind =
  'sharepic' | 'presentation' | 'sheet' | 'document' | 'board' | 'explainable';

const ARTIFACT_CLAIM_NOUNS: Record<EditableArtifactKind, string> = {
  sharepic: 'sharepics?|karussells?|slider|folien?|dachzeile|kachel',
  presentation: 'präsentation(?:en)?|praesentation(?:en)?|folien?|deck',
  sheet: 'tabellen?|spalten?|zeilen?|zellen?',
  document: 'dokument(?:e|s)?|absatz|absätze|abschnitte?|begründung',
  board: 'boards?|karten?|aufgaben?',
  explainable: 'explainables?|erklärseiten?|abschnitte?',
};

// Ich-Perfekt mit Artefakt-Nomen und Änderungsverb im selben Satz — oder das
// Passiv („Folie 4 wurde … gelöscht", live 11.10.2026 nach einem
// gescheiterten Planer). „Ich habe den Text überarbeitet" bleibt — das kann
// eine Textantwort meinen.
const claimRe = (nouns: string) =>
  new RegExp(
    `(?<!\\p{L})ich\\s+habe\\s+(?:dir\\s+)?[^.!?\\n]{0,60}?(?<!\\p{L})(?:${nouns})(?!\\p{L})[^.!?\\n]{0,80}?(?<!\\p{L})(?:${EDIT_CLAIM_VERBS})(?!\\p{L})` +
      `|(?<!\\p{L})(?:${nouns})(?!\\p{L})[^.!?\\n]{0,80}?(?<!\\p{L})(?:wurde|wurden|ist|sind)\\s+(?:[^.!?\\n]{0,60}?\\s)?(?:${PASSIVE_CLAIM_VERBS})(?!\\p{L})`,
    'iu'
  );
const ARTIFACT_CLAIM_RE = Object.fromEntries(
  Object.entries(ARTIFACT_CLAIM_NOUNS).map(([kind, nouns]) => [kind, claimRe(nouns)])
) as Record<EditableArtifactKind, RegExp>;

// Die Floskel, die echte Revisionen anhängen — ohne den Satz davor ein Echo.
const SHAREPIC_EDIT_TAIL_RE = /^sag\s+mir,\s+wenn\s+noch\s+etwas\s+anders\s+sein\s+soll\.?$/iu;

export const PHANTOM_SHAREPIC_EDIT_FALLBACK =
  'Diese Änderung habe ich nicht am Sharepic umgesetzt. Nenne sie direkt am Feld (z. B. „Headline kürzer" oder „Dachzeile: …") oder aktiviere an der Karte „Im Chat bearbeiten".';
export const PHANTOM_ARTIFACT_EDIT_FALLBACK =
  'Diese Änderung habe ich nicht umgesetzt — es lief kein Werkzeug, das sie ausgeführt hätte. Sag mir bitte noch einmal, was sich ändern soll.';

/**
 * „Ich habe die Tabelle sortiert", ohne dass in diesem Zug ein Werkzeug die
 * Tabelle geändert hat (#4458). Live 11.10.2026: „verschoben" nach einem
 * gescheiterten `move_card`, „sortiert" ohne jedes Werkzeug. Ein Satz fällt
 * nur, wenn KEINE der Arten, die er nennt, geändert wurde („Folie" meint
 * Karussell wie Präsentation). `guarded` sind die Arten, die der Thread
 * wirklich hat — ohne Tabelle im Gespräch meint „Tabelle" die im Chat-Text.
 */
export function stripPhantomArtifactEdit(
  text: string,
  turn: {
    edited: ReadonlySet<EditableArtifactKind>;
    guarded: ReadonlySet<EditableArtifactKind>;
  }
): { text: string; removed: string[] } {
  if (typeof text !== 'string' || text.length === 0) {
    return { text: typeof text === 'string' ? text : '', removed: [] };
  }
  // Eine Markdown-Tabelle in der Antwort: dann meint „Tabelle" eben diese.
  const guarded = /^\s*\|.*\|\s*$/m.test(text)
    ? new Set([...turn.guarded].filter((k) => k !== 'sheet'))
    : turn.guarded;
  if (guarded.size === 0) return { text, removed: [] };

  const removed: string[] = [];
  const removedKinds = new Set<EditableArtifactKind>();
  const parts = text.split(/((?<=[.!?])[ \t]+|\s*\n\s*)/);
  let out = '';
  let pendingSep = '';
  for (let i = 0; i < parts.length; i += 2) {
    const sentence = parts[i];
    const sep = parts[i + 1] ?? '';
    const named = [...guarded].filter((kind) => ARTIFACT_CLAIM_RE[kind].test(sentence));
    const phantom = named.length > 0 && !named.some((kind) => turn.edited.has(kind));
    const echo = removedKinds.has('sharepic') && SHAREPIC_EDIT_TAIL_RE.test(sentence.trim());
    if (phantom || echo) {
      removed.push(sentence.trim());
      named.forEach((kind) => removedKinds.add(kind));
      pendingSep = strongerSeparator(pendingSep, sep);
      continue;
    }
    out += pendingSep + sentence;
    pendingSep = sep;
  }
  if (removed.length === 0) return { text, removed };
  out = out.trim();
  if (out.length > 0) return { text: out, removed };
  const onlySharepic = [...removedKinds].every((k) => k === 'sharepic');
  return {
    text: onlySharepic ? PHANTOM_SHAREPIC_EDIT_FALLBACK : PHANTOM_ARTIFACT_EDIT_FALLBACK,
    removed,
  };
}

/**
 * „Ich erstelle dir jetzt die Sharepics …", ohne dass in diesem Turn ein
 * Artefakt entstanden ist. Live 15.10.2026 auf ein „ja mach das bitte" (steps=0):
 *
 *   Ich erstelle dir jetzt die Sharepics für den Slider basierend auf dem
 *   Entwurf. Da ein Slider aus mehreren Bildern besteht, generiere ich diese
 *   nacheinander für dich. (Hier erfolgt nun die Erstellung der Sharepics durch
 *   die entsprechenden Werkzeuge des Grünerators)
 *
 * `stripPhantomArtifactEdit` kennt nur das Ich-Perfekt einer Änderung,
 * `announcesPendingWork` nur das Passiv und schreibt nur Telemetrie. Nach dem
 * Turn läuft nichts mehr — eine Erstellung, die er ankündigt, findet nie statt.
 *
 * Drei Bedingungen je Satz, alle nötig, damit bestellter Inhalt bleibt („Ich
 * erstelle gerade Flyer für den Infostand" in einem geschriebenen Post):
 *  - eine Ankündigung — Ich-Präsens oder Ich-Futur eines Erzeugungsverbs, das
 *    Passiv „werden jetzt erstellt" oder „erfolgt nun die Erstellung";
 *  - ein Artefakt-Nomen im selben Satz;
 *  - ein Signal, dass der Satz die Person anspricht, statt Inhalt zu sein: ein
 *    Jetzt-Wort, „dir/euch/für dich", oder die Klammer, mit der das Modell
 *    einen Werkzeugaufruf nachspielt.
 * Fragen sind Angebote und bleiben stehen. Und nur kurze Antworten: ein
 * geschriebener Text ist länger als die Floskel, die einen Aufruf ersetzt.
 */
// Nur Erzeugen, nicht Ändern: „Ich setze dir das jetzt im Dokument um" kann
// wahr sein, wenn der Client die Änderung nach dem Turn anwendet.
const CREATE_VERB_1SG =
  'erstelle|generiere|baue|entwerfe|gestalte|erzeuge|mache|wandle|zeichne|rendere';
const CREATE_VERB_INF =
  'erstellen|generieren|bauen|entwerfen|gestalten|erzeugen|machen|anlegen|umsetzen|umwandeln|zeichnen|rendern';
const CREATE_PARTICIPLE =
  'erstellt|generiert|gebaut|entworfen|gestaltet|erzeugt|angelegt|gerendert';
const CREATION_ANNOUNCEMENT_RE = new RegExp(
  `(?<!\\p{L})(?:ich\\s+(?:${CREATE_VERB_1SG})|(?:${CREATE_VERB_1SG})\\s+ich)(?!\\p{L})` +
    `|(?<!\\p{L})ich\\s+werde\\s+[^.!?\\n]{0,80}?(?<!\\p{L})(?:${CREATE_VERB_INF})(?!\\p{L})` +
    `|(?<!\\p{L})(?:wird|werden)\\s+(?:jetzt|nun|gerade|gleich|sofort)\\s+(?:[^.!?\\n]{0,40}?\\s)?(?:${CREATE_PARTICIPLE})(?!\\p{L})` +
    `|(?<!\\p{L})erfolgt\\s+(?:jetzt\\s+|nun\\s+|gleich\\s+)?die\\s+(?:erstellung|generierung|umsetzung)(?!\\p{L})`,
  'iu'
);
const CREATION_NOUN_RE =
  /(?<!\p{L})(?:sharepics?|karussells?|slider|kacheln?|grafiken?|bild(?:er)?|ki-bild(?:er)?|präsentation(?:en)?|praesentation(?:en)?|folien?|tabellen?|dokument(?:e|s)?|pdfs?|boards?|explainables?)(?!\p{L})/iu;
const ADDRESSES_PERSON_RE =
  /(?<!\p{L})(?:jetzt|nun|gleich|sofort|nacheinander|direkt|dir|euch|für\s+dich|fuer\s+dich)(?!\p{L})|^\s*\(/iu;
const CONDITIONAL_OFFER_RE = /(?<!\p{L})(?:wenn|falls|sofern)\s+(?:du|ihr|sie)(?!\p{L})/iu;
// „Ich mache dir jetzt kein Sharepic" ist eine ehrliche Absage, keine Ankündigung.
const NEGATED_RE = /(?<!\p{L})(?:kein\p{L}*|nicht|nichts)(?!\p{L})/iu;
const CREATION_CLAIM_MAX_CHARS = 800;

export const PHANTOM_CREATION_FALLBACK =
  'Erstellt habe ich in diesem Schritt nichts — dafür lief kein Werkzeug. Sag mir noch einmal, was entstehen soll.';

export function stripPhantomArtifactCreation(
  text: string,
  turn: { createdArtifact: boolean }
): { text: string; removed: string[] } {
  if (typeof text !== 'string' || text.length === 0) {
    return { text: typeof text === 'string' ? text : '', removed: [] };
  }
  if (turn.createdArtifact || text.length > CREATION_CLAIM_MAX_CHARS) return { text, removed: [] };
  // Inhalt im Chat (Markdown-Tabelle, Codeblock) ist die Lieferung, auf die sich
  // „Ich erstelle dir die Tabelle hier" bezieht.
  if (/^\s*\|.*\|\s*$/m.test(text) || text.includes('```')) return { text, removed: [] };
  const removed: string[] = [];
  const parts = text.split(/((?<=[.!?)])[ \t]+|\s*\n\s*)/);
  let out = '';
  let pendingSep = '';
  for (let i = 0; i < parts.length; i += 2) {
    const sentence = parts[i] ?? '';
    const sep = parts[i + 1] ?? '';
    const trimmed = sentence.trim();
    // Frage = Angebot, Doppelpunkt = leitet gelieferten Inhalt ein („Ich
    // erstelle dir hier eine Tabelle:" vor einer Markdown-Tabelle), „wenn du
    // willst" = bedingtes Angebot. Alle drei bleiben.
    const hit =
      !trimmed.endsWith('?') &&
      !trimmed.endsWith(':') &&
      !CONDITIONAL_OFFER_RE.test(trimmed) &&
      !NEGATED_RE.test(trimmed) &&
      CREATION_ANNOUNCEMENT_RE.test(trimmed) &&
      CREATION_NOUN_RE.test(trimmed) &&
      ADDRESSES_PERSON_RE.test(trimmed);
    if (hit) {
      removed.push(trimmed);
      pendingSep = strongerSeparator(pendingSep, sep);
      continue;
    }
    out += pendingSep + sentence;
    pendingSep = sep;
  }
  if (removed.length === 0) return { text, removed };
  out = out.trim();
  return { text: out.length > 0 ? out : PHANTOM_CREATION_FALLBACK, removed };
}

export function stripPhantomSharepicEdit(
  text: string,
  turn: { sharepicToolRan: boolean }
): { text: string; removed: string[] } {
  return stripPhantomArtifactEdit(text, {
    edited: new Set(turn.sharepicToolRan ? ['sharepic'] : []),
    guarded: new Set(['sharepic']),
  });
}
