/**
 * Pure routing decision for the agentic loop — extracted from the 1300-line
 * contract router so the "does this turn enter the loop?" logic is unit-testable
 * in isolation (no Express/Qdrant/streamText deps). See routing.vitest.ts.
 */

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

// Greetings/identity/thanks are ABOUT THE ASSISTANT, not the world — length
// can't separate "Wie hat X abgestimmt?" (factual) from "Hallo, wer bist du?"
// (chit-chat), so match the latter explicitly and keep it on the fast path.
const CHITCHAT_RE =
  /^(hallo|hi|hey|servus|moin|na\b|guten (morgen|tag|abend)|danke|thx|wer bist du|was (kannst|bist) du|wie geht|wie heißt du|hilfe|test)\b/i;

// Personal-data asks ("meine Dokumente", "zeig meine offenen Aufgaben", "welche
// Boards habe ich") don't always carry a question word — a bare possessive + a
// personal-content noun ("meine Boards") slips both the question-word and
// verb-first nets. Route them into the loop so the personal-data resource tools
// (find_content/documents/boards_tasks/notebooks) are reachable.
const PERSONAL_DATA_RE =
  /\b(mein|meine|meiner|meinen)\b[\s\wäöüß]*\b(dokumente?|boards?|aufgaben?|tasks?|notizb[üu]cher|sammlung\w*|reels?|sharepics?|gruppen?|inhalte?)\b/i;

export function looksLikeToolableQuestion(raw: string): boolean {
  const t = (raw ?? '').trim();
  if (t.split(/\s+/).filter(Boolean).length < 3) return false;
  if (CHITCHAT_RE.test(t)) return false;
  return (
    t.includes('?') ||
    TOOLABLE_QUESTION_RE.test(t) ||
    VERB_FIRST_RE.test(t) ||
    PERSONAL_DATA_RE.test(t)
  );
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
]);

/**
 * Compound research+generation detector (Phase 3n): a generation turn (sharepic,
 * presentation, sheet) that ALSO carries an explicit research/facts signal
 * enters the loop with the matching fat tool mounted, so search + generation
 * compose in one turn. Pure "Mach ein Sharepic/eine Präsentation zu X" must stay
 * false — "zu X" alone is a topic, not a research ask — keeping the single-pass
 * fixed-text/direct-dispatch contract.
 */
const GENERATION_NOUN_RE =
  /\b(sharepic|share-pic|grafik|kachel|pr[äa]sentation|presentation|folien?|slides?|tabelle|kalkulation|spreadsheet|sheet|dokument|schriftst[üu]ck|textdokument|entwurf|board|kanban|aufgabenboard|taskboard)\b/i;
const RESEARCH_SIGNAL_RE =
  /\b(recherchier\w*|such[e]?\b|finde|informier\w*|aktuell\w*|zahlen|fakten|daten|statistik\w*|position\w*|programm\w*|beschl(u|ü)ss\w*|was\s+sag(t|en)|abgestimmt|studie\w*)\b/i;

export function looksLikeCompoundGeneration(raw: string): boolean {
  const t = (raw ?? '').trim();
  return GENERATION_NOUN_RE.test(t) && RESEARCH_SIGNAL_RE.test(t);
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

export type CompoundGenerationKind = 'sharepic' | 'presentation' | 'sheet' | 'document' | 'board';

// Per-artifact nouns, used to recover the generation KIND from the text when the
// intent no longer names it (a demoted `agentic` turn, or a `direct` misroute).
const SHAREPIC_NOUN_RE = /\b(sharepic|share-pic|grafik|kachel)\b/i;
const PRESENTATION_NOUN_RE = /\b(pr[äa]sentation|presentation|folien?|slides?)\b/i;
const SHEET_NOUN_RE = /\b(tabelle|kalkulation|spreadsheet|sheet)\b/i;
const BOARD_NOUN_RE = /\b(board|kanban|aufgabenboard|taskboard)\b/i;
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
  if (intent === 'agentic' || intent === 'direct') {
    // Order = specificity: the concrete products first, the generic "Dokument"
    // last (it's the fallback artifact when nothing more specific matches).
    if (SHAREPIC_NOUN_RE.test(t)) return 'sharepic';
    if (PRESENTATION_NOUN_RE.test(t)) return 'presentation';
    if (SHEET_NOUN_RE.test(t)) return 'sheet';
    if (BOARD_NOUN_RE.test(t)) return 'board';
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

export interface EditToolLoopInput {
  /** CHAT_AGENT_LOOP flag — the edit tool only exists inside the loop. */
  loopEnabled: boolean;
  /** Surface resolved via {@link resolveEditorSurfaceKind}. */
  surfaceKind: EditorSurfaceKind | null;
  /** Surfaces the CHAT_EDIT_TOOL_SURFACES flag has enabled the tool for. */
  flaggedSurfaces: ReadonlySet<EditorSurfaceKind>;
  intent: string;
  /** The turn is a "research + edit the open artifact" compound (looksLikeCompoundEdit). */
  isCompoundEdit: boolean;
  /** A current document/board is actually open (rawCurrentDocument/Board id present). */
  hasEditTarget: boolean;
  forcedTool: boolean;
  isCompound: boolean;
  hasImageAttachments: boolean;
  secondaryIntent: string | null;
}

/**
 * Whether a turn should route into the loop with the surface's `edit_document`/
 * `edit_board` tool mounted. Requires the loop + per-surface flag on, a resolved
 * and flagged surface with an open target, and an edit intent — then the same
 * single-pass kill-switches as {@link decideRunAgentic} apply. When the flag is
 * off (`flaggedSurfaces` empty) this is always false, so the legacy
 * trigger_doc_edit path is unaffected.
 */
export function decideEditToolLoop(p: EditToolLoopInput): boolean {
  if (!p.loopEnabled) return false;
  if (!p.surfaceKind || !p.flaggedSurfaces.has(p.surfaceKind)) return false;
  if (!p.hasEditTarget) return false;
  const isEditIntent =
    p.intent === 'edit_current_doc' || p.intent === 'edit_current_board' || p.isCompoundEdit;
  if (!isEditIntent) return false;
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
}

/**
 * Single source of truth for the runAgentic gate. Note there is NO
 * tool-capability check: with the planner/executor split (see loopEngine), a
 * fixed fast planner does every tool call, so ANY selected model can drive the
 * loop — the model choice only decides unified-vs-split MODE inside the loop.
 */
export function decideRunAgentic(p: AgenticDecisionInput): boolean {
  const compoundGen = COMPOUND_GENERATION_INTENTS.has(p.intent) && p.compoundGeneration;
  const inLoopSet =
    p.agenticIntents.has(p.intent) ||
    (p.intent === 'direct' && looksLikeToolableQuestion(p.lastUserText)) ||
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
