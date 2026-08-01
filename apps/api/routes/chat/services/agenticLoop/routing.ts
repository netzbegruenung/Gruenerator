/**
 * Pure routing decision for the agentic loop — extracted from the 1300-line
 * contract router so the "does this turn enter the loop?" logic is unit-testable
 * in isolation (no Express/Qdrant/streamText deps). See routing.vitest.ts.
 *
 * The one import is deliberate: fastPathGuards is itself a zero-import leaf, so
 * the "what counts as a sharepic ask" vocabulary can live in exactly one place
 * without this module losing its purity. `decisionJournal` is the same kind of
 * leaf (a dependency-free `node:async_hooks` store), so recording here keeps
 * this module's unit-testability intact.
 */
import { type ChatIntentId } from '@gruenerator/shared/chat-intents';

import {
  ARTIFACT_NOUN_BY_KIND,
  CREATION_VERB_RE,
  creationOrderPattern,
  forbidsPersistentAction,
  hasExplicitSharepicWord,
  isNegatedArtifactRequest,
  type ForbiddableArtifact,
} from '../../../../agents/langgraph/ChatGraph/nodes/fastPathGuards.js';
import { recordDecision } from '../../../../utils/decisionJournal.js';

/**
 * The classifier can still drop a factual question into a no-tool verdict —
 * "Wie hat X abgestimmt?" labelled `produktion` — where nothing is looked up.
 * Such a turn shaped like a real question is let into the loop (full catalog)
 * so the MODEL decides whether a tool fits: a wrongly-looped chit-chat just
 * answers directly (cheap), while a wrongly-`produktion` factual turn fails
 * hard. Kept deliberately narrow (≥4 words + a question mark or interrogative)
 * so greetings ("Wer bist du?", "Wie geht's?") stay on the fast path.
 *
 * Since the intent split these three conditions are a RESCUE, not the main
 * door: what the classifier cannot place now goes to `agentic` directly (prompt
 * rule 12), which is in AGENTIC_INTENTS. They still matter for the no-tool
 * verdicts the model DID commit to and got wrong.
 */
// NICHT aus der `prose`-Disposition abgeleitet, obwohl es fast dieselbe Menge
// ist — und die Differenz ist der Grund. Die Disposition beantwortet „braucht
// dieser Intent ein Werkzeug?" (ein Gruss: nein). Diese Menge beantwortet
// „welche Verdikte dürfen die drei Rettungen unten überhaupt anfassen?", und
// `greeting` steht bewusst NICHT darin: seit #2269 trägt ein Gruss einen eigenen
// Intent, damit ihn keine Formulierung und kein Selbstwiderspruch des
// Klassifikators mehr in den Loop ziehen kann. Das ist eine strukturelle
// Garantie und stärker als jede Wortprüfung — eine Ableitung würde sie
// aufgeben. `dispositionSets.vitest.ts` hält den Unterschied fest, damit er
// beim nächsten Mal nicht still verschwindet.
const NO_TOOL_VERDICTS: ReadonlySet<string> = new Set(['produktion', 'direct']);

// Question words. Includes the wo-compounds (worüber/woran/womit/…) that the
// original list missed — live failure: "worüber hat X im Bundestag gesprochen"
// slipped the net (no "?" either) and reached the flaky LLM classifier, which
// returned `direct` and answered ungrounded.
const TOOLABLE_QUESTION_RE =
  /\b(wie|was|welche[rs]?|wer|wen|wem|wann|warum|wieso|weshalb|wo|wohin|woher|wof[üu]r|wor(?:über|an|auf|aus|in|um)|womit|wovon|wonach|wobei|wozu|wodurch|inwiefern|inwieweit|nenne|zeige?|liste|finde|vergleiche|recherchiere|suche?|erkl[äa]re|gib)\b/i;

// German polar/verb-first questions carry no question word — "hat X … gesprochen",
// "gibt es …", "kann man …". Match a LEADING finite auxiliary/modal verb only
// (NOT content imperatives like "schreib"/"mach"/"erstelle", which are creative
// generation and must stay on the fast path).
const VERB_FIRST_RE =
  /^(hat|haben|hatte|h[äa]tte|ist|sind|war|waren|gibt|gab|kann|k[öo]nnen|konnte|wird|wurde|werden|soll\w*|muss|m[üu]ssen|darf|d[üu]rfen|welche[rs]?)\b/i;

// A leading greeting is a strippable PREFIX, not a terminal signal — "Hallo!
// Wie hat X abgestimmt?" is a factual ask wearing a greeting. Strip it, then
// only genuine assistant-directed cores (identity/thanks/help) stay chit-chat.
const GREETING_PREFIX_RE =
  /^(?:(?:hallo|hi|hey|servus|moin|na|guten\s+(?:morgen|tag|abend)|danke|thx|vielen dank)\b[\s,.!:;–—-]*)+/i;
const CHITCHAT_RE = /^(wer bist du|was (kannst|bist) du|wie geht|wie heißt du|hilfe|test)\b/i;

// Personal-data asks ("meine Dokumente", "zeig meine offenen Aufgaben", "welche
// Boards habe ich") don't always carry a question word — a bare possessive + a
// personal-content noun ("meine Boards") slips both the question-word and
// verb-first nets. Route them into the loop so the personal-data resource tools
// (find_content/documents/boards_tasks/notebooks) are reachable.
const PERSONAL_DATA_RE =
  /\b(mein|meine|meiner|meinen)\b[\s\wäöüß]*\b(dokumente?|boards?|aufgaben?|tasks?|notizb[üu]cher|sammlung\w*|reels?|sharepics?|gruppen?|inhalte?)\b/i;

export function looksLikeToolableQuestion(raw: string): boolean {
  const t = (raw ?? '').trim().replace(GREETING_PREFIX_RE, '');
  if (t.split(/\s+/).filter(Boolean).length < 3) return false;
  if (CHITCHAT_RE.test(t)) return false;
  return (
    t.includes('?') ||
    TOOLABLE_QUESTION_RE.test(t) ||
    VERB_FIRST_RE.test(t) ||
    PERSONAL_DATA_RE.test(t)
  );
}

// Anchored: the WHOLE message is pleasantry. "Danke, und was sagt die Studie
// dazu?" must not match.
//
// This is the surviving half of what used to be `looksLikeGroundedFollowup`, a
// POSITIVE gate that demanded an anaphor ("dazu", "mehr", "genauer") before a
// direct turn was allowed the thread's sources. It was removed with the switch
// to the negative gate in `needsThreadGrounding`: it let a whole class through
// ungrounded (any writing order), and where it did fire it fired by accident as
// often as by design — "er ist doch kein MdB mehr" matched on the negation
// particle "mehr", which the list meant as the expansion word in "erzähl mehr".
/** Nothing but pasted link(s) — see `looksLikeSelfContainedTurn`. */
const BARE_URL_ONLY_RE = /^(?:\s*https?:\/\/\S+)+\s*$/i;

const CHITCHAT_ONLY_RE =
  /^(danke\w*|dank\s+dir|thx|ok(ay)?|alles\s+klar|super|top|passt|perfekt|prima|cool|ja|nein|gut)\b[\s,.!?–—-]*$/i;

/**
 * "Does this turn need the thread's research behind it?"
 *
 * A NEGATIVE gate: ground unless the turn is one of the two shapes that provably
 * do not want the thread's sources. It used to be positive — an anaphor or a
 * question word had to be present — and that let a whole class through
 * ungrounded: "schreibe ein vollständiges Dossier über Robert" is neither a
 * question nor an anaphor, so a thread holding 19 researched sources answered it
 * from parametric memory.
 *
 * The old predicate was also right by accident at least as often as by design:
 * "er ist doch kein MdB mehr" grounded only because CONTINUATION_MARKER_RE
 * matched the negation particle "mehr", which the list means as the expansion
 * word in "erzähl mir mehr".
 *
 * Cheap to be generous here: `getRecentThreadSources` returns [] on a thread
 * with no research, so on a fresh thread this is one indexed query and a no-op.
 * The cost of a false positive is a few hundred tokens of topically adjacent
 * context; the cost of a false negative is a confidently wrong answer.
 */
/**
 * „Arbeitet dieser Turn an Text, der schon da ist?"
 *
 * Kürzen, übersetzen, nochmal-aber-kürzer, ein Gedicht — alle drei sind in dem
 * gegründet, woran sie arbeiten. Fremde Recherche danebenzulegen lädt das Modell
 * ein, in einen Kürzungsauftrag neue Behauptungen zu schmuggeln, und schaltet
 * [N] für eine Antwort ein, die nichts zitiert.
 *
 * Herausgezogen, weil der Loop dieselbe Antwort braucht und sie bisher nicht
 * hatte: `seedCarried` lief ungetort, `carryThreadSourcesIfNeeded` getort. Über
 * den 196-Turn-Korpus gemessen sind das zwei Turns, die im Loop Recherche unter
 * eine Kürzung gelegt bekamen — „Kannst du die Überschrift kürzer machen?" und
 * „Kürze diesen Redeentwurf auf zwei Minuten: <Text>".
 *
 * Bewusst NUR diese drei Klauseln, nicht das ganze `needsThreadGrounding`:
 * dessen Chitchat-Klausel hängt an `CHITCHAT_RE`, und deren `^hilfe` verschluckt
 * „Hilfe bei der Formulierung brauche ich nicht, aber: Was fordern die Grünen …"
 * — eine echte Retrieval-Frage. Sie hier mitzunehmen hätte zwei Fehler gegen
 * einen dritten getauscht.
 */
export function rewritesSuppliedText(raw: string): boolean {
  const t = (raw ?? '').trim().replace(GREETING_PREFIX_RE, '');
  if (t.length === 0) return false;
  return REWRITE_TARGET_RE.test(t) || REGENERATE_RE.test(t) || CREATIVE_FORM_RE.test(t);
}

export function needsThreadGrounding(raw: string): boolean {
  const t = (raw ?? '').trim().replace(GREETING_PREFIX_RE, '');
  if (t.length === 0) return false;
  // Pleasantries want nothing. Kept as the first check so a bare "Danke!" never
  // reaches the database at all.
  if (CHITCHAT_ONLY_RE.test(t) || CHITCHAT_RE.test(t)) return false;
  // Kürzen, nochmal-aber-anders, Gedicht — die Begründung steht bei
  // `rewritesSuppliedText`, das der Loop seit demselben Befund ebenfalls fragt.
  if (rewritesSuppliedText(t)) return false;
  return true;
}

// ── "Hat der Mensch die Substanz mitgeliefert?" ──────────────────────────────
//
// The rule these three regexes implement: a writing order is `direct` ONLY when
// the material to write FROM is already in the turn. Everything else goes to the
// loop, where the planner decides whether to search.
//
// This inverts the old default, which was written down twice — as
// "Erstelle/Schreib X = IMMER direct" in the classifier prompt and as
// "Users on this platform typically provide their own content" above the
// fact-based-content heuristic. Live failure: "schreibe ein vollständiges
// Dossier über Robert" in a thread holding 19 researched sources answered from
// the model's parametric memory, contradicting the answer two turns above
// (Habeck as sitting Vizekanzler "Stand 2024", an invented book title).

// Orders to produce text. The verbs first, then the factual TEXT SORTS, which
// carry the order implicitly ("ein Dossier über X, 1000 Zeichen" has no verb).
const WRITING_ORDER_RE =
  /\b(schreib|erstell|formulier|verfass|entwirf|entwerfe|texte|dichte)[a-zäöüß]*\b|\b(pressemitteilung|pressemeldung|rede|ansprache|artikel|blogpost|statement|dossier|steckbrief|portr[äa]t|portrait|biografie|biographie|faktencheck|analyse|bericht|report|antrag|argumentationshilfe|positionspapier|hintergrundpapier|leserbrief|editorial|kommentar)[a-zäöüß]*\b/i;

// Pure creative FORM — "substance" is not a meaningful category here, so these
// stay `direct` no matter what the user did or didn't supply. A poem about
// autumn needs no sources and must not pay the loop's latency; this is also the
// pin `classifierDemotion.vitest.ts` guards ("creative writing is never
// demoted").
const CREATIVE_FORM_RE =
  /\b(gedicht|lyrik|reim|slogan|claim|motto|spruch|witz|einzeiler|songtext|liedtext|trinkspruch|gru[ßss]wort|gl[üu]ckwunsch|geburtstagskarte|dankeskarte)[a-zäöüß]*\b/i;

// The order points at material that already exists — in the message, in the
// thread, or in the open document. A rewrite is definitionally grounded in what
// it rewrites, so it stays `direct` even though nothing was pasted THIS turn.
// Note the `[üu]`/`(?:^|\W)` idiom rather than `\b` before an umlaut: without
// the `u` flag `ü` is not a `\w`, so `\büberarbeite` can never match.
// "Do it again, in another shape" — a regenerate verb BOUND to a format or
// language target. The binding is what makes it safe: a bare "nochmal" is not
// enough, because "erklär mir das nochmal" is a continuation that must stay
// grounded and "prüfe nochmal im web" is a research order. Only the redo of an
// existing answer into another form is exempt.
const REGENERATE_RE =
  /\b(nochmal|noch\s+einmal|erneut|nochmals)\b[^.?!]*\b(auf\s+(englisch|deutsch|franz[öo]sisch|spanisch|italienisch|t[üu]rkisch)|k[üu]rzer|l[äa]nger|anders|f[öo]rmlicher|freundlicher|einfacher|in\s+stichpunkten)\b/i;

const REWRITE_TARGET_RE =
  /\b(k[üu]rze|k[üu]rzer|straffe|verk[üu]rze|umformulier|umschreib|[üu]berarbeit|korrigier|lektorier|vereinfach|versch[äa]rfe|gendere|[üu]bersetze?)[a-zäöüß]*\b|\b(diese[nrsm]?|obige[nrsm]?|folgende[nrsm]?)\s+(text|entwurf|abschnitt|absatz|fassung|version)\b|\b(das|es)\s+(k[üu]rzer|l[äa]nger|freundlicher|f[öo]rmlicher|einfacher)\b/i;

/**
 * A writing order whose SUBSTANCE the user did not supply.
 *
 * `hasOwnMaterial` is the caller's answer to "does this turn carry its own
 * material?" — a long paste, an attachment, or an open document. It is passed in
 * rather than sniffed here so this module stays a dependency-free leaf and the
 * threshold (NOUN_TRIGGER_MAX_LENGTH) keeps living with the heuristics.
 *
 * Returns false for anything that is not a writing order at all, so callers can
 * OR it into an existing gate without widening what they already catch.
 */
export function looksLikeUnsourcedWritingOrder(
  raw: string,
  opts: { hasOwnMaterial: boolean }
): boolean {
  if (opts.hasOwnMaterial) return false;
  const t = (raw ?? '').trim();
  if (t.length === 0) return false;
  if (CREATIVE_FORM_RE.test(t)) return false;
  if (REWRITE_TARGET_RE.test(t)) return false;
  // The verb can belong to a PROHIBITION instead of an order: "Halte das fest,
  // aber erstelle diesmal kein Dokument" is the exact sentence fastPathGuards
  // was written for. Reading its "erstelle" as a writing order sent the turn to
  // the loop, and the router's persistent-action gate only ever sees artifact
  // intents — so the one gate that demotes a forbidden artifact to `direct` was
  // skipped by the very phrasing it exists for.
  if (isNegatedArtifactRequest(t, WRITING_ORDER_RE)) return false;
  return WRITING_ORDER_RE.test(t);
}

/**
 * "Can this turn be answered from what is already on the table?"
 *
 * The inversion of the old default, and the reason it exists: a no-tool verdict
 * used to be the RESIDUAL — anything the heuristics could not name became
 * `direct`, and three separate rescue predicates (`looksLikeToolableQuestion`,
 * `classifierContradictedResearch`, `looksLikeUnsourcedWritingOrder`) were bolted
 * on over time to pull specific shapes back out of it. Each rescue was written
 * after a live failure, which is the tell: the residual was answering questions
 * it had never been asked. A bare topic ("Windkraft Bayern"), a statement to
 * check, an imperative with no question word — none of them carried a signal any
 * of the three looked for, so all of them were answered from parametric memory.
 *
 * So the burden of proof moves. A turn stays off the loop only when it POSITIVELY
 * shows it needs nothing fetched:
 *  - pleasantries, which want no answer at all;
 *  - pure creative form — a poem needs no sources and must never carry [N];
 *  - a rewrite or a regenerate, definitionally grounded in the text it acts on;
 *  - a turn carrying its own material (long paste, attachment, open document),
 *    where a planner would go looking for what the user already supplied.
 *
 * Everything else defaults into the loop, where the planner decides whether to
 * call a tool. That is the cheap direction to be wrong in: an unnecessary loop
 * costs latency, an unnecessary `direct` costs a confidently wrong answer.
 *
 * Same predicate on both sides of the wire on purpose — the classifier's
 * demotion gate and the router's `decideRunAgentic` implement one rule, and two
 * hand-maintained copies of one rule is the drift shape this whole series is
 * unwinding.
 */
export function looksLikeSelfContainedTurn(
  raw: string,
  opts: { hasOwnMaterial: boolean }
): boolean {
  const t = (raw ?? '').trim().replace(GREETING_PREFIX_RE, '');
  if (t.length === 0) return true;
  // Under three words nothing can be demonstrated either way — "Und nun?",
  // "mach weiter", "und Bayern?" are whatever the THREAD says they are, and this
  // predicate cannot see the thread. Same floor `looksLikeToolableQuestion` uses,
  // for the same reason: a default must not fire on absent evidence. The
  // classifier applies a wider version of this exemption (it CAN see the thread,
  // via the vague-follow-up penalty and `lastToolContext`); here it stays at the
  // floor so the router never contradicts a decision the classifier made with
  // more information.
  if (t.split(/\s+/).filter(Boolean).length < 3) return true;
  if (CHITCHAT_ONLY_RE.test(t) || CHITCHAT_RE.test(t)) return true;
  // A message that is nothing but pasted link(s) names its own subject — the
  // page IS the material. It already has a deterministic single-pass route
  // (the classifier's URL wrapper takes the `scrape_url` slot outright), and
  // looping it would buy a planner call to arrive at the same one tool. A link
  // WITH prose around it is a different turn and still loops.
  if (BARE_URL_ONLY_RE.test(t)) return true;
  if (CREATIVE_FORM_RE.test(t)) return true;
  if (REWRITE_TARGET_RE.test(t) || REGENERATE_RE.test(t)) return true;
  // A PROHIBITION is not a request, and it must not reach a planner. "Halte die
  // Ergebnisse fest, aber erstelle diesmal kein Dokument" is honoured by exactly
  // one thing — the router's persistent-action gate — and that gate only ever
  // sees ARTIFACT intents. Demoting this turn to `agentic` would hand the
  // forbidden tool to a model that never saw the gate, which is the same hole
  // `looksLikeUnsourcedWritingOrder` documents one function up; the default
  // inversion would have re-opened it from the other side.
  if (isNegatedArtifactRequest(t, WRITING_ORDER_RE)) return true;
  if (opts.hasOwnMaterial) return true;
  return false;
}

/**
 * Generation intents that can enter the loop as a COMPOUND turn (research +
 * generation composed in one turn via an opaque fat tool). Each keeps its
 * single-pass direct dispatch for non-research asks ("mach ein Sharepic zu X"):
 * only a turn that ALSO carries a research signal is lifted into the loop.
 */
// The literal is `satisfies`-checked against the intent union, so a typo or a
// renamed intent fails the build — it used to compile and silently never match.
// The Set stays `ReadonlySet<string>` because `decideRunAgentic` takes a plain
// `intent: string`; narrowing that is a separate change.
export const COMPOUND_GENERATION_INTENTS: ReadonlySet<string> = new Set([
  'sharepic',
  'create_presentation',
  'create_sheet',
  'create_pdf',
] as const satisfies readonly ChatIntentId[]);

/**
 * Compound research+generation detector (Phase 3n): a generation turn (sharepic,
 * presentation, sheet) that ALSO carries an explicit research/facts signal
 * enters the loop with the matching fat tool mounted, so search + generation
 * compose in one turn. Pure "Mach ein Sharepic/eine Präsentation zu X" must stay
 * false — "zu X" alone is a topic, not a research ask — keeping the single-pass
 * fixed-text/direct-dispatch contract.
 */
// Sharepic nouns are deliberately absent — they come in via
// hasExplicitSharepicWord below, which knows the full vocabulary and its
// negation/quote guards. "grafik"/"kachel" are gone entirely: they mean a chart
// or a tile at least as often, and this pair was the quiet door through which
// "recherchiere X und mach eine Grafik" forced a sharepic nobody asked for.
const GENERATION_NOUN_RE =
  /\b(pr[äa]sentation|presentation|folien?|slides?|tabelle|kalkulation|spreadsheet|sheet|dokument|schriftst[üu]ck|textdokument|entwurf|board|kanban|aufgabenboard|taskboard|pdf|briefkopf|antragsformular|anmeldeformular|fragebogen)\b/i;
// `recherch\w*` (not `recherchier\w*`) so the NOUN "Recherche" counts too — a
// follow-up like "erstelle ein PDF mit den Originalquellen aus der Recherche"
// carries an unmistakable research signal but no research VERB, and used to
// fall through to the single-pass generator with no sources at all.
// `\w*quellen?` likewise catches Quellen/Originalquellen/Primärquellen.
const RESEARCH_SIGNAL_RE =
  /\b(recherch\w*|such[e]?\b|finde|informier\w*|aktuell\w*|zahlen|fakten|daten|statistik\w*|position\w*|programm\w*|beschl(u|ü)ss\w*|was\s+sag(t|en)|abgestimmt|studie\w*|\w*quellen?|belege\w*|nachweis\w*)\b/i;

export function looksLikeCompoundGeneration(raw: string): boolean {
  const t = (raw ?? '').trim();
  return (GENERATION_NOUN_RE.test(t) || hasExplicitSharepicWord(t)) && RESEARCH_SIGNAL_RE.test(t);
}

// An instruction to MODIFY the open document/board (editor sidebars). Catches
// the edit verbs and "als/ins <artifact-part>" targets. Used with a research
// signal to detect a compound "recherchiere X UND bau es ins Dokument ein" turn.
const EDIT_SIGNAL_RE =
  /\b(einf[üu]g\w*|hinzuf[üu]g\w*|erg[äa]nz\w*|[üu]berarbeit\w*|aktualisier\w*|einarbeit\w*|einbau\w*|einpfleg\w*)\b|\bf[üu]g\w*\b[^.?!]*\b(hinzu|ein)\b|\b(als|ins?|in die|in der|in den)\s+(folie|abschnitt|dokument|tabelle|pr[äa]sentation|kapitel|spalte|zeile|karte|liste)\b/i;

// An EXPLICIT research verb (not the broad RESEARCH_SIGNAL_RE, whose content
// nouns "aktuell/programm/position/daten" are everyday words in a pure edit like
// "Aktualisiere die Daten in der Tabelle" or "Überarbeite die aktuelle Folie" —
// those must stay single-pass, not force a research loop).
const RESEARCH_VERB_RE = /\b(recherchier\w*|such\w*|finde|informier\w*|nachschlag\w*|google)\b/i;

/**
 * The user explicitly told the assistant to look something up in THIS turn.
 *
 * Why this exists: `forceFirstToolCall` was scoped to `intent === 'mcp'`, while
 * the classifier's loop demotion routes search/web asks into `agentic`, where
 * the planner is free to call nothing at all. Live result: "Recherchiere bitte
 * mit Quellen" answered "Ich habe keinen Zugriff auf eine Live-Datenbank …
 * soll ich das für Dich übernehmen?" with steps=0 — after the assistant had
 * searched unprompted one turn earlier. Tool use has to follow the instruction,
 * not the planner's mood.
 *
 * Narrow on purpose: an explicit research VERB, or an imperative paired with an
 * unmistakable source demand ("mit Quellen", "belege das"). Content nouns like
 * "aktuelle Daten" alone do NOT qualify — they are everyday words in edit turns.
 */
export function looksLikeExplicitResearchOrder(raw: string): boolean {
  const t = (raw ?? '').trim();
  if (t.length === 0) return false;
  if (RESEARCH_VERB_RE.test(t)) return true;
  return /\b(mit\s+quellen|mit\s+belegen|beleg\w*\s+(das|es|die|deine)|quellen\s+(angeben|nennen|dazu))\b/i.test(
    t
  );
}

/**
 * A compound "research + edit the OPEN doc/board" turn (editor sidebars only):
 * an EXPLICIT research verb AND an edit instruction. The caller gates this on an
 * editor surface (an edit_current_* tool enabled + a current doc/board), then
 * runs the research loop and emits the doc/board edit with the freshly-gathered
 * sources as reference material. Pure edits ("füge eine Abschlussfolie hinzu" —
 * no research; "Aktualisiere die Daten" — a content noun but no research verb)
 * stay single-pass; pure research (no edit verb) stays a normal loop answer.
 */
export function looksLikeCompoundEdit(raw: string): boolean {
  const t = (raw ?? '').trim();
  return RESEARCH_VERB_RE.test(t) && EDIT_SIGNAL_RE.test(t);
}

/**
 * Editor-surface predicate shared by the router and the tool catalog so both
 * layers agree on "this sidebar edits the open artifact and must never spawn a
 * NEW one". Keyed on an edit_current_* tool being enabled.
 */
export function isEditorSurface(enabledTools: Record<string, boolean> | undefined): boolean {
  return (
    enabledTools?.['edit_current_doc'] === true || enabledTools?.['edit_current_board'] === true
  );
}

export type CompoundGenerationKind =
  'sharepic' | 'presentation' | 'sheet' | 'document' | 'board' | 'pdf';

// `sharepic` is absent on purpose: hasExplicitSharepicWord already refuses a
// negated ask, so it needs no second guard here.
const FORBIDDABLE_BY_KIND: Partial<Record<CompoundGenerationKind, ForbiddableArtifact>> = {
  presentation: 'presentation',
  sheet: 'sheet',
  board: 'board',
  pdf: 'pdf',
  document: 'document',
};

// Per-artifact nouns, used to recover the generation KIND from the text when the
// intent no longer names it (a demoted `agentic` turn, or a `direct` misroute).
// Paired with a creation verb via creationOrderPattern — the SAME builder the
// classifier fast paths use, so both word orders are recognised here too and the
// two layers cannot drift apart on phrasing again.
const PRESENTATION_CREATE_RE = creationOrderPattern('pr[äa]sentation|presentation|folien?|slides?');
const SHEET_CREATE_RE = creationOrderPattern('tabelle|kalkulation|spreadsheet|sheet');
const BOARD_CREATE_RE = creationOrderPattern('board|kanban|aufgabenboard|taskboard');
const PDF_CREATE_RE = creationOrderPattern(
  'pdf|briefkopf|antragsformular|anmeldeformular|fragebogen' +
    '|(?:ausf(?:ü|ue)llbar)[a-zäöü]*\\s+(?:formular|vorlage)',
  { extraVerbs: 'schreib', forward: 60 }
);
const DOCUMENT_CREATE_RE = creationOrderPattern('dokument|schriftst[üu]ck|textdokument|entwurf', {
  extraVerbs: 'schreib|anleg',
});

/**
 * The generation KIND a compound turn should mount a fat tool for. Prefers the
 * classified generation intent; on a DEMOTED (`agentic`) or mislabelled
 * (`direct`) turn — where the intent no longer names the artifact — it recovers
 * the kind from the noun in the text. This is why "mach mir eine Tabelle draus"
 * still creates a sheet even though the classifier only reached `direct@0.50`
 * (→ demoted to `agentic`), not `create_sheet`.
 */
export function compoundGenerationKind(intent: string, raw: string): CompoundGenerationKind | null {
  const t = (raw ?? '').trim();
  // A NAMED generation intent has a single-pass dispatcher of its own, so only a
  // turn that ALSO carries a research signal is lifted into the loop; without it
  // `null` means "the dispatcher builds it", which is correct and faster.
  if (COMPOUND_GENERATION_INTENTS.has(intent)) {
    if (!looksLikeCompoundGeneration(t)) return null;
    if (intent === 'sharepic') return 'sharepic';
    if (intent === 'create_presentation') return 'presentation';
    if (intent === 'create_sheet') return 'sheet';
    if (intent === 'create_pdf') return 'pdf';
  }
  if (intent === 'agentic' || intent === 'produktion' || intent === 'direct') {
    // No research gate on this branch, and the asymmetry is the whole point:
    // none of these three has a dispatcher behind it. Here `null` means the loop
    // runs with no generation tool mounted at all — which is how "das bitte
    // schön als PDF erstellen" was answered with "ich habe keine technische
    // Funktion, um PDFs zu erstellen" while create_pdf sat unmounted. That turn
    // is a `produktion` one since the intent split: a writing order whose
    // substance is already in the thread is exactly what the research gate
    // could never license.
    // What replaces the research signal is the creation ORDER: a verb that
    // actually points at the artifact noun. A turn that merely MENTIONS one
    // ("was steht im PDF?") still returns null, which matters because the kind
    // does not just mount the tool — forceCompoundGeneration GUARANTEES the
    // artifact when the planner skips it.
    //
    // Order = specificity: the concrete products first, the generic "Dokument"
    // last (it's the fallback artifact when nothing more specific matches).
    // pdf before document: "PDF-Dokument" names both nouns but means a PDF.
    const kind =
      hasExplicitSharepicWord(t) && CREATION_VERB_RE.test(t)
        ? 'sharepic'
        : PRESENTATION_CREATE_RE.test(t)
          ? 'presentation'
          : SHEET_CREATE_RE.test(t)
            ? 'sheet'
            : BOARD_CREATE_RE.test(t)
              ? 'board'
              : PDF_CREATE_RE.test(t)
                ? 'pdf'
                : DOCUMENT_CREATE_RE.test(t)
                  ? 'document'
                  : null;
    if (kind == null) return null;
    // The router's negative-action gate keys on the classified INTENT, so a kind
    // recovered from the TEXT never passes under it — "erstelle diesmal kein
    // Dokument" on a demoted turn would mount the doc tool, and
    // forceCompoundGeneration would then guarantee the very artifact the user
    // forbade. Re-checked here because this is where the kind first exists.
    const family = FORBIDDABLE_BY_KIND[kind];
    if (family && forbidsPersistentAction(t, ARTIFACT_NOUN_BY_KIND[family])) return null;
    return kind;
  }
  return null;
}

/**
 * The five embedded editor surfaces whose sidebar can drive a tool-based edit of
 * the OPEN artifact inside the agentic loop (see editorTools). Distinct from
 * {@link CompoundGenerationKind} (which is about spawning a NEW artifact).
 */
export type EditorSurfaceKind = 'doc' | 'sheet' | 'presentation' | 'board' | 'canvas';

const EDITOR_AGENT_KIND: ReadonlyArray<readonly [string, EditorSurfaceKind]> = [
  ['gruenerator-sheets-editor', 'sheet'],
  ['gruenerator-presentations-editor', 'presentation'],
  ['gruenerator-boards-editor', 'board'],
  ['gruenerator-sharepic-editor', 'canvas'],
  ['gruenerator-docs-editor', 'doc'],
];

/**
 * Resolves which editor surface (if any) a turn belongs to. Prefers the dedicated
 * editor agent's identifier; falls back to the enabled edit_current_* tool so a
 * turn on a custom agent inside an editor sidebar still resolves. Returns null for
 * every non-editor turn (the common case), so the caller can early-out cheaply.
 */
export function resolveEditorSurfaceKind(
  agentIdentifier: string | undefined,
  enabledTools: Record<string, boolean> | undefined
): EditorSurfaceKind | null {
  if (agentIdentifier) {
    for (const [id, kind] of EDITOR_AGENT_KIND) {
      if (agentIdentifier === id) return kind;
    }
  }
  if (enabledTools?.['edit_current_board'] === true) return 'board';
  if (enabledTools?.['edit_current_doc'] === true) return 'doc';
  return null;
}

/**
 * Editor surfaces with a tool-based edit path implemented — the loop plans ops
 * and streams `editor_operations` instead of the client round-trip. These are
 * NOT live yet, so there is no legacy behaviour to protect and no rollout flag:
 * the tool path is simply the default for them. The still-live surfaces
 * (`doc`, `board`, `canvas`) are absent here and keep the trigger_doc_edit path.
 * Add a surface once its editorTools branch AND client ops handler are wired.
 */
export const TOOL_EDIT_SURFACES: ReadonlySet<EditorSurfaceKind> = new Set([
  'sheet',
  'presentation',
  'board',
]);

export interface EditToolLoopInput {
  /** CHAT_AGENT_LOOP — the edit tool only exists inside the loop. */
  loopEnabled: boolean;
  /** Surface resolved via {@link resolveEditorSurfaceKind}. */
  surfaceKind: EditorSurfaceKind | null;
  /** The AI-edit toggle is ON (edit_current_doc/board enabled). When OFF, the
   *  tool must NOT mount — otherwise the model "edits" and claims success while
   *  the client (which also gates on the toggle) refuses to apply. */
  editToolEnabled: boolean;
  /** A current document/board is actually open (rawCurrentDocument/Board id present). */
  hasEditTarget: boolean;
  forcedTool: boolean;
  isCompound: boolean;
  hasImageAttachments: boolean;
  secondaryIntent: string | null;
}

/**
 * Whether a turn should route into the loop with the surface's `edit_document`
 * tool mounted. An editor sidebar is fundamentally an editing surface, so the
 * tool is mounted (and loop entry forced) for EVERY substantive turn with an
 * open target on a tool-path surface ({@link TOOL_EDIT_SURFACES}) — the MODEL
 * then decides whether to edit. Deliberately NOT gated on the classifier's
 * `edit_current_*` intent: it routinely mislabels edit asks as `direct`
 * ("trag es in die Tabelle ein") and drops short follow-ups ("ja ab a1") into a
 * single-pass `direct` turn, both of which must still be able to edit. The same
 * single-pass kill-switches as {@link decideRunAgentic} still apply. A surface
 * without a tool path (doc/board/canvas) returns false → legacy trigger path.
 */
export function decideEditToolLoop(p: EditToolLoopInput): boolean {
  if (!p.loopEnabled) return false;
  if (!p.surfaceKind || !TOOL_EDIT_SURFACES.has(p.surfaceKind)) return false;
  if (!p.editToolEnabled) return false;
  if (!p.hasEditTarget) return false;
  return !p.forcedTool && !p.isCompound && !p.hasImageAttachments && p.secondaryIntent == null;
}

export interface AgenticDecisionInput {
  /** CHAT_AGENT_LOOP flag resolved by the caller. */
  loopEnabled: boolean;
  /** The set of intents that own the loop (AGENTIC_INTENTS). Injected so this
   *  module stays free of the heavy agenticRespondService import. */
  agenticIntents: ReadonlySet<string>;
  intent: string;
  /** Last user message text — consulted for the `direct` rescue. */
  lastUserText: string;
  /** An @tool mention pinned a deterministic single-pass tool. */
  forcedTool: boolean;
  /** `mcp` turns are "forced" via @<server> but still belong in the loop. */
  isMcpTurn: boolean;
  /** Notebook gather pipeline — stays single-pass. */
  isCompound: boolean;
  /** A generation secondaryIntent (search + image/chart/...): single-pass
   *  fan-out — entering the loop would silently drop the secondary. Exception:
   *  scrape_url on a compound-generation turn (the loop scrapes itself). */
  secondaryIntent: string | null;
  /** Compound research+generation sharepic turn (fat tool mounted). */
  compoundGeneration: boolean;
  /** image_edit / vision turns stay single-pass. */
  hasImageAttachments: boolean;
  /** A fill ask ("füll das aus") on a thread that has a PDF. Precomputed by the
   *  caller (isSheetFillRequest) so this module stays import-free. */
  isPdfFillRequest: boolean;
  /** The classifier answered `needsResearch: true` and then picked `direct`.
   *  Rescues the turn into the loop even when it isn't shaped like a question —
   *  the `direct` rescue below keys on phrasing, and the failing turns were
   *  statements ("Erklär mir die aktuellen Vorwürfe gegen …") that carry a real
   *  retrieval need without a single question word. */
  classifierContradictedResearch?: boolean;
  /** The turn brings its own material — a long paste, an attachment, or an open
   *  document. Feeds `looksLikeUnsourcedWritingOrder`: a writing order WITH
   *  material stays single-pass, without it the loop decides whether to search. */
  hasOwnMaterial?: boolean;
}

/**
 * Single source of truth for the runAgentic gate. Note there is NO
 * tool-capability check: with the planner/executor split (see loopEngine), a
 * fixed fast planner does every tool call, so ANY selected model can drive the
 * loop — the model choice only decides unified-vs-split MODE inside the loop.
 */
export function decideRunAgentic(p: AgenticDecisionInput): boolean {
  const compoundGen = COMPOUND_GENERATION_INTENTS.has(p.intent) && p.compoundGeneration;
  // "Füll mir das Formular aus" is an imperative with no question word, so
  // looksLikeToolableQuestion rejects it by design (content imperatives are
  // creative generation). With a PDF attached it is exactly a tool turn — and
  // the PDF form tools only exist inside the loop.
  // A writing order with no supplied substance is the THIRD `direct` rescue.
  // The first two both key on the turn looking like a question (`looksLike-
  // ToolableQuestion`) or on the classifier having contradicted itself — and
  // `classifierContradictedResearch` is only ever set in the LLM tier, so every
  // turn that short-circuits earlier could never reach it. A "schreib eine
  // Pressemitteilung zu X" carries neither signal and used to answer from
  // parametric memory with no way in.
  const unsourcedWriting = looksLikeUnsourcedWritingOrder(p.lastUserText, {
    hasOwnMaterial: p.hasOwnMaterial === true,
  });
  // The three rescues above are now the SUBSET of a default: `looksLike-
  // SelfContainedTurn` says which turns provably need nothing fetched, and
  // everything else loops. They stay named in the journal because each one
  // records a live failure, and losing the names would lose the reason.
  const selfContained = looksLikeSelfContainedTurn(p.lastUserText, {
    hasOwnMaterial: p.hasOwnMaterial === true,
  });
  const inLoopSet =
    p.agenticIntents.has(p.intent) ||
    (NO_TOOL_VERDICTS.has(p.intent) &&
      (looksLikeToolableQuestion(p.lastUserText) ||
        p.classifierContradictedResearch === true ||
        unsourcedWriting ||
        !selfContained)) ||
    p.isPdfFillRequest ||
    compoundGen;
  const secondaryAllowed =
    p.secondaryIntent == null || (compoundGen && p.secondaryIntent === 'scrape_url');
  // `mcp` is the ONLY executor for its turns (the legacy mcpToolNode was removed),
  // so it always enters the loop — independent of CHAT_AGENT_LOOP and of inLoopSet.
  // The single-pass kill-switches below (compound / image / secondary) still apply.
  const gateOpen = p.isMcpTurn || (p.loopEnabled && inLoopSet);
  const runAgentic =
    gateOpen &&
    (!p.forcedTool || p.isMcpTurn) &&
    !p.isCompound &&
    secondaryAllowed &&
    !p.hasImageAttachments;
  recordDecision('router.run_agentic', runAgentic ? 'loop' : 'single_pass', {
    inputs: {
      intent: p.intent,
      loopEnabled: p.loopEnabled,
      inLoopSet,
      gateOpen,
      isMcpTurn: p.isMcpTurn,
      isCompound: p.isCompound,
      forcedTool: p.forcedTool,
      secondaryAllowed,
      hasImageAttachments: p.hasImageAttachments,
      isPdfFillRequest: p.isPdfFillRequest,
      unsourcedWriting,
      selfContained,
      hasOwnMaterial: p.hasOwnMaterial === true,
    },
  });
  return runAgentic;
}
