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
const TOOLABLE_QUESTION_RE =
  /\b(wie|was|welche[rs]?|wer|wen|wem|wann|warum|wieso|weshalb|wo|wohin|woher|wof[üu]r|nenne|zeige?|liste|finde|vergleiche|recherchiere|suche?|erkl[äa]re|gib)\b/i;

// Greetings/identity/thanks are ABOUT THE ASSISTANT, not the world — length
// can't separate "Wie hat X abgestimmt?" (factual) from "Hallo, wer bist du?"
// (chit-chat), so match the latter explicitly and keep it on the fast path.
const CHITCHAT_RE =
  /^(hallo|hi|hey|servus|moin|na\b|guten (morgen|tag|abend)|danke|thx|wer bist du|was (kannst|bist) du|wie geht|wie heißt du|hilfe|test)\b/i;

export function looksLikeToolableQuestion(raw: string): boolean {
  const t = (raw ?? '').trim();
  if (t.split(/\s+/).filter(Boolean).length < 3) return false;
  if (CHITCHAT_RE.test(t)) return false;
  return t.includes('?') || TOOLABLE_QUESTION_RE.test(t);
}

export interface AgenticDecisionInput {
  /** CHAT_AGENT_LOOP flag resolved by the caller. */
  loopEnabled: boolean;
  /** The set of intents that own the loop (AGENTIC_INTENTS). Injected so this
   *  module stays free of the heavy agenticRespondService import. */
  agenticIntents: ReadonlySet<string>;
  intent: string;
  /** Last user message text — only consulted for the `direct` rescue. */
  lastUserText: string;
  /** An @tool mention pinned a deterministic single-pass tool. */
  forcedTool: boolean;
  /** `mcp` turns are "forced" via @<server> but still belong in the loop. */
  isMcpTurn: boolean;
  /** Notebook gather pipeline — stays single-pass. */
  isCompound: boolean;
  /** A generation secondaryIntent (search + sharepic): single-pass fan-out
   *  until Phase 3n fat tools exist, else the secondary is silently dropped. */
  hasSecondaryIntent: boolean;
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
  const inLoopSet =
    p.agenticIntents.has(p.intent) ||
    (p.intent === 'direct' && looksLikeToolableQuestion(p.lastUserText));
  return (
    p.loopEnabled &&
    inLoopSet &&
    (!p.forcedTool || p.isMcpTurn) &&
    !p.isCompound &&
    !p.hasSecondaryIntent &&
    !p.hasImageAttachments
  );
}
