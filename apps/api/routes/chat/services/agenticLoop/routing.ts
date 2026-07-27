/**
 * Pure routing decision for the agentic loop — extracted from the 1300-line
 * contract router so the "does this turn enter the loop?" logic is unit-testable
 * in isolation (no Express/Qdrant/streamText deps). See routing.vitest.ts.
 *
 * The one import is deliberate: fastPathGuards is itself a zero-import leaf, so
 * the "what counts as a sharepic ask" vocabulary can live in exactly one place
 * without this module losing its purity.
 */
import { hasExplicitSharepicWord } from '../../../../agents/langgraph/ChatGraph/nodes/fastPathGuards.js';

/**
 * The classifier drops many factual questions into `intent: 'direct'` ("no
 * intent detected") — e.g. "Wie hat X abgestimmt?" — where no tool ever runs.
 * A `direct` turn shaped like a real question is let into the loop (full
 * catalog) so the MODEL decides whether a tool fits: a wrongly-looped chit-chat
 * just answers directly (cheap), while a wrongly-`direct` factual turn fails
 * hard. Kept deliberately narrow (≥4 words + a question mark or interrogative)
 * so greetings ("Wer bist du?", "Wie geht's?") stay on the fast path.
 */
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

// Anaphors and expansion words — the two ways German asks for "more of what we
// were just talking about". The da-compounds point back at the topic; the
// expansion words ask for depth. Clause-final `das`/`es` counts too ("erzähl
// mir mehr davon", "was gibt es noch dazu").
//
// `nochmal`/`erneut` are deliberately OUT (unlike MCP_CONTINUATION_REFERENTIAL,
// where "do it again" IS the signal): here they are regenerate verbs with no
// topical content — "Nochmal auf Englisch" wants a rewrite, not research.
const CONTINUATION_MARKER_RE =
  /\b(dazu|dar[üu]ber|davon|daraus|damit|daran|darauf|dabei|hierzu|mehr|weitere?[snmr]?|genauer|n[äa]her|ausf[üu]hrlicher|details?|vertief\w*|sonst\s+noch|noch\s+(mehr|was|etwas))\b/i;

// Anchored: the WHOLE message is pleasantry. "Danke, und was sagt die Studie
// dazu?" must not match.
const CHITCHAT_ONLY_RE =
  /^(danke\w*|dank\s+dir|thx|ok(ay)?|alles\s+klar|super|top|passt|perfekt|prima|cool|ja|nein|gut)\b[\s,.!?–—-]*$/i;

/**
 * A vague CONTINUATION of the running conversation ("Mehr dazu bitte") rather
 * than a new topic or a pleasantry.
 *
 * Such a turn classifies as `direct` — it carries no question word, no verb the
 * toolable net catches, nothing. On the single-pass path that used to mean the
 * previous turn's sources were neither carried nor citable, so the model
 * rewrote its own last answer from that answer's prose: ungrounded,
 * uncitable, and to the reader indistinguishable from research.
 *
 * The word cap is the discriminator that matters: a message long enough to
 * carry its own subject is not leaning on the thread for one.
 */
export function looksLikeGroundedFollowup(raw: string): boolean {
  const t = (raw ?? '').trim().replace(GREETING_PREFIX_RE, '');
  if (t.length === 0) return false;
  if (CHITCHAT_ONLY_RE.test(t)) return false;
  if (t.split(/\s+/).filter(Boolean).length > 12) return false;
  return CONTINUATION_MARKER_RE.test(t);
}

/**
 * "Does this turn need the thread's research behind it?" — the union both the
 * loop gate and the single-pass source carry consult, so a turn cannot be
 * grounded on one path and amnesiac on the other.
 */
export function needsThreadGrounding(raw: string): boolean {
  return looksLikeToolableQuestion(raw) || looksLikeGroundedFollowup(raw);
}

/**
 * Generation intents that can enter the loop as a COMPOUND turn (research +
 * generation composed in one turn via an opaque fat tool). Each keeps its
 * single-pass direct dispatch for non-research asks ("mach ein Sharepic zu X"):
 * only a turn that ALSO carries a research signal is lifted into the loop.
 */
export const COMPOUND_GENERATION_INTENTS: ReadonlySet<string> = new Set([
  'sharepic',
  'create_presentation',
  'create_sheet',
  'create_pdf',
]);

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

// Per-artifact nouns, used to recover the generation KIND from the text when the
// intent no longer names it (a demoted `agentic` turn, or a `direct` misroute).
const PRESENTATION_NOUN_RE = /\b(pr[äa]sentation|presentation|folien?|slides?)\b/i;
const SHEET_NOUN_RE = /\b(tabelle|kalkulation|spreadsheet|sheet)\b/i;
const BOARD_NOUN_RE = /\b(board|kanban|aufgabenboard|taskboard)\b/i;
const PDF_NOUN_RE =
  /\b(pdf|briefkopf|antragsformular|anmeldeformular|fragebogen|(ausf(ü|ue)llbar)[a-zäöü]*\s+(formular|vorlage))\b/i;
const DOCUMENT_NOUN_RE = /\b(dokument|schriftst[üu]ck|textdokument|entwurf)\b/i;

/**
 * The generation KIND a compound turn should mount a fat tool for. Prefers the
 * classified generation intent; on a DEMOTED (`agentic`) or mislabelled
 * (`direct`) turn — where the intent no longer names the artifact — it recovers
 * the kind from the noun in the text. This is why "mach mir eine Tabelle draus"
 * still creates a sheet even though the classifier only reached `direct@0.50`
 * (→ demoted to `agentic`), not `create_sheet`. Returns null when the turn is
 * not compound (no research signal, or no generation noun).
 */
export function compoundGenerationKind(intent: string, raw: string): CompoundGenerationKind | null {
  const t = (raw ?? '').trim();
  if (!looksLikeCompoundGeneration(t)) return null;
  if (intent === 'sharepic') return 'sharepic';
  if (intent === 'create_presentation') return 'presentation';
  if (intent === 'create_sheet') return 'sheet';
  if (intent === 'create_pdf') return 'pdf';
  if (intent === 'agentic' || intent === 'direct') {
    // Order = specificity: the concrete products first, the generic "Dokument"
    // last (it's the fallback artifact when nothing more specific matches).
    // pdf before document: "PDF-Dokument" names both nouns but means a PDF.
    if (hasExplicitSharepicWord(t)) return 'sharepic';
    if (PRESENTATION_NOUN_RE.test(t)) return 'presentation';
    if (SHEET_NOUN_RE.test(t)) return 'sheet';
    if (BOARD_NOUN_RE.test(t)) return 'board';
    if (PDF_NOUN_RE.test(t)) return 'pdf';
    if (DOCUMENT_NOUN_RE.test(t)) return 'document';
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
  const inLoopSet =
    p.agenticIntents.has(p.intent) ||
    (p.intent === 'direct' &&
      (looksLikeToolableQuestion(p.lastUserText) || p.classifierContradictedResearch === true)) ||
    p.isPdfFillRequest ||
    compoundGen;
  const secondaryAllowed =
    p.secondaryIntent == null || (compoundGen && p.secondaryIntent === 'scrape_url');
  // `mcp` is the ONLY executor for its turns (the legacy mcpToolNode was removed),
  // so it always enters the loop — independent of CHAT_AGENT_LOOP and of inLoopSet.
  // The single-pass kill-switches below (compound / image / secondary) still apply.
  const gateOpen = p.isMcpTurn || (p.loopEnabled && inLoopSet);
  return (
    gateOpen &&
    (!p.forcedTool || p.isMcpTurn) &&
    !p.isCompound &&
    secondaryAllowed &&
    !p.hasImageAttachments
  );
}
