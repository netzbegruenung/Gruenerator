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

export function looksLikeToolableQuestion(raw: string): boolean {
  const t = (raw ?? '').trim();
  if (t.split(/\s+/).filter(Boolean).length < 3) return false;
  if (CHITCHAT_RE.test(t)) return false;
  return t.includes('?') || TOOLABLE_QUESTION_RE.test(t) || VERB_FIRST_RE.test(t);
}

/**
 * Compound research+generation detector (Phase 3n slice): a sharepic turn that
 * ALSO carries an explicit research/facts signal enters the loop with the
 * sharepic fat tool mounted, so search + generation compose in one turn.
 * Pure "Mach ein Sharepic zu Solarenergie" must stay false — "zu X" alone is
 * a topic, not a research ask — keeping the single-pass fixed-text contract.
 */
const GENERATION_NOUN_RE = /\b(sharepic|share-pic|grafik|kachel)\b/i;
const RESEARCH_SIGNAL_RE =
  /\b(recherchier\w*|such[e]?\b|finde|informier\w*|aktuell\w*|zahlen|fakten|daten|statistik\w*|position\w*|programm\w*|beschl(u|ü)ss\w*|was\s+sag(t|en)|abgestimmt|studie\w*)\b/i;

export function looksLikeCompoundGeneration(raw: string): boolean {
  const t = (raw ?? '').trim();
  return GENERATION_NOUN_RE.test(t) && RESEARCH_SIGNAL_RE.test(t);
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
  const compoundSharepic = p.intent === 'sharepic' && p.compoundGeneration;
  const inLoopSet =
    p.agenticIntents.has(p.intent) ||
    (p.intent === 'direct' && looksLikeToolableQuestion(p.lastUserText)) ||
    compoundSharepic;
  const secondaryAllowed =
    p.secondaryIntent == null || (compoundSharepic && p.secondaryIntent === 'scrape_url');
  return (
    p.loopEnabled &&
    inLoopSet &&
    (!p.forcedTool || p.isMcpTurn) &&
    !p.isCompound &&
    secondaryAllowed &&
    !p.hasImageAttachments
  );
}
