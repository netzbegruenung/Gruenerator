/**
 * Auto-mode model & reasoning policy.
 *
 * `auto` used to be resolved on the CLIENT before the request went out, so it
 * only ever knew `threadMode` and the agent's `autoRoutingHint`. The intent —
 * the thing that actually describes the task — is produced by the classifier
 * on the server, one stage later. This module is where that decision now
 * lives: intent (+ complexity) in, model lane and reasoning strength out.
 *
 * It is deliberately PURE — no env access, no model instantiation, no imports
 * from `providers.ts`. That keeps it unit-testable without mocks and makes the
 * lane constants below importable by `providers.ts` without a cycle.
 *
 * ── What the auto model actually does per intent ────────────────────────────
 * The lane assignments below are not "which model is best" in the abstract.
 * For many intents the real work is delegated to a PINNED model and the auto
 * model only writes the surrounding chat text:
 *   - create_sheet / edit_current_doc → ops come from sheetAiService, pinned to
 *     mistral-medium-2604 with no fallback chain.
 *   - save_as_doc → document body comes from the `doc_generation` worker type.
 *   - sharepic → the answer text is a fixed template string in the router; the
 *     slogan comes from sharepicGenerationService. Auto has NO effect, so
 *     `sharepic` is intentionally absent from the table.
 *   - summary → summarizeNode already runs on INTERMEDIATE_MODEL (Small 4).
 *
 * ── Second-order effect ─────────────────────────────────────────────────────
 * `prefersUnifiedLoop` is true only for Mistral. Picking a Mistral lane
 * therefore also selects the UNIFIED loop (one model does tools + prose);
 * every other lane runs the split (fixed planner gathers, synth writes).
 */

import { getSystemAgent } from '@gruenerator/shared/agents';

/**
 * Reasoning strength. `off` means "do not think at all" — for the lanes that
 * stream reasoning by default this means routing around the reasoning path
 * entirely (see isReasoningStreamModel), not just a lower budget.
 *
 * The four steps are NOT equally expressive on every upstream:
 *   - gpt-oss has a native low/medium/high dial and honours all four;
 *   - Mistral's dial is BINARY ('high' | 'none' — anything else is a ZodError
 *     in @ai-sdk/mistral), so `low` collapses to off there. See
 *     `mistralReasoningOption` in responseStreamingService.
 *   - the remaining lanes only have on/off.
 */
export type ReasoningSetting = 'off' | 'low' | 'medium' | 'high';

export type Complexity = 'simple' | 'moderate' | 'complex';

/** A scalar applies to every complexity; the record grades by it. */
type ReasoningRule = ReasoningSetting | Record<Complexity, ReasoningSetting>;

/** Keys into AVAILABLE_MODELS (providers.ts). Not the user-facing catalog. */
export type AutoLaneId = 'mistral-small-4' | 'gemma-litellm' | 'mistral-medium-3.5' | 'litellm';

interface AutoEntry {
  modelId: AutoLaneId;
  reasoning: ReasoningRule;
}

const graded = (
  simple: ReasoningSetting,
  moderate: ReasoningSetting,
  complex: ReasoningSetting
): Record<Complexity, ReasoningSetting> => ({ simple, moderate, complex });

/**
 * Lane A — Mistral Small 4 (regolo). Short, structured, latency-critical turns
 * where the prose share is small or the work is delegated anyway.
 *
 * Reasoning stays OFF across this whole lane, measured rather than assumed
 * (live probe, "Zug 9:40 + 95 min"):
 *   - thinking works and is correct, but costs ~1.6–2k characters of reasoning
 *     on a trivial question — expensive for the lane we picked FOR speed;
 *   - `effort: 'low'` barely moves it (1629 vs 2013 chars unset), because Small
 *     4 has no native effort dial — only gpt-oss does;
 *   - at a 400-token budget the reasoning consumed the entire allowance and the
 *     answer came back EMPTY.
 * The model stays registered in REGOLO_REASONING_MODELS so the ceiling can be
 * lifted here if the quality eval argues for it, without a silent no-op.
 */
const SMALL: AutoLaneId = 'mistral-small-4';
/** Lane B — Gemma 4. Prose over sources; this is what the loop's writer slot
 *  already does today, so these intents stay behaviourally close to master. */
const GEMMA: AutoLaneId = 'gemma-litellm';
/** Lane C — Mistral Medium 3.5. Only where the model calls tools ITSELF and
 *  the unified loop should kick in. */
const MEDIUM: AutoLaneId = 'mistral-medium-3.5';
/** Lane D — GPT-OSS. The speed lane. */
const FAST: AutoLaneId = 'litellm';

const POLICY: Record<string, AutoEntry> = {
  // ── Lane A: Small 4 ──
  // Synth summarises tool output; the planner makes the MCP calls.
  mcp: { modelId: SMALL, reasoning: 'off' },
  // summarizeNode already runs on this model — same tier.
  summary: { modelId: SMALL, reasoning: 'off' },
  chat_history: { modelId: SMALL, reasoning: 'off' },
  // Narration over an artefact that is already IN CONTEXT (numbers, chart data,
  // scraped text). Measured good on Small 4 — correct arithmetic, clean German.
  compute: { modelId: SMALL, reasoning: 'off' },
  chart: { modelId: SMALL, reasoning: 'off' },
  scrape_url: { modelId: SMALL, reasoning: 'off' },
  // Structured facts from system MCP sources — reporting, not writing.
  bahn: { modelId: SMALL, reasoning: 'off' },
  wetter: { modelId: SMALL, reasoning: 'off' },
  hotel: { modelId: SMALL, reasoning: 'off' },
  reise: { modelId: SMALL, reasoning: 'off' },
  umfragen: { modelId: SMALL, reasoning: 'off' },

  // ── Lane B: Gemma 4 ──
  research: { modelId: GEMMA, reasoning: graded('low', 'medium', 'medium') },
  search: { modelId: GEMMA, reasoning: graded('low', 'low', 'medium') },
  web: { modelId: GEMMA, reasoning: graded('low', 'low', 'medium') },
  compare: { modelId: GEMMA, reasoning: graded('low', 'low', 'medium') },
  examples: { modelId: GEMMA, reasoning: 'low' },
  pressemitteilung_examples: { modelId: GEMMA, reasoning: 'low' },
  bundestag: { modelId: GEMMA, reasoning: graded('low', 'low', 'medium') },
  abgeordnetenwatch: { modelId: GEMMA, reasoning: graded('low', 'low', 'medium') },
  news: { modelId: GEMMA, reasoning: graded('low', 'low', 'medium') },
  // Tier-3.5 loop demotion: the loop's model picks its own tools.
  agentic: { modelId: GEMMA, reasoning: 'low' },
  // Creative short-form — thinking does not help here.
  social_post: { modelId: GEMMA, reasoning: 'off' },
  image: { modelId: GEMMA, reasoning: 'off' },

  // ── Lane C: Mistral Medium 3.5 ──
  //
  // The "narrate a platform ACTION" family. These announce something the
  // platform did (or is about to do) that the model cannot see in its context —
  // it has to know the product can do it at all. Measured on the live eval
  // (`evals/corpus/autolane.jsonl`, save_as_doc cases):
  //   - Small 4:  "Ich kann keine neuen Dateien … erstellen" — capability
  //               refusal, plus Siezen against the Du-Form house style, and the
  //               document was created anyway → narration contradicted action.
  //   - Gemma 4:  refuses too ("keinen Zugriff auf dein Dateisystem"), 4–5x
  //               slower, and one case failed to generate at all.
  //   - Medium:   "Ich habe … als Dokument im Grünerator gespeichert" — correct,
  //               Du-Form, narration matches the action.
  // Note the single-pass path has no `capabilityNote` (that lives in the
  // agentic loop), so these intents depend on the model's own product knowledge.
  save_as_doc: { modelId: MEDIUM, reasoning: 'off' },
  modify_doc: { modelId: MEDIUM, reasoning: 'off' },
  share_doc: { modelId: MEDIUM, reasoning: 'off' },
  artifact: { modelId: MEDIUM, reasoning: 'off' },

  edit_current_doc: { modelId: MEDIUM, reasoning: graded('medium', 'high', 'high') },
  edit_current_board: { modelId: MEDIUM, reasoning: graded('medium', 'high', 'high') },
  create_sheet: { modelId: MEDIUM, reasoning: graded('medium', 'high', 'high') },
  create_presentation: { modelId: MEDIUM, reasoning: graded('medium', 'high', 'high') },
  create_recurring_task: { modelId: MEDIUM, reasoning: 'medium' },
  // The router rewrites this to `agentic`; kept as a safety net.
  modify_board: { modelId: MEDIUM, reasoning: 'medium' },
  // The vision override in resolveModel wins over this anyway.
  image_edit: { modelId: MEDIUM, reasoning: 'off' },

  // ── Lane D: GPT-OSS ──
  direct: { modelId: FAST, reasoning: graded('off', 'off', 'low') },
};

/** Unknown/absent intent → the speed lane. */
const DEFAULT_ENTRY: AutoEntry = { modelId: FAST, reasoning: graded('off', 'off', 'low') };

/**
 * Intents with no inherent task shape — a greeting and a "just answer me" turn
 * look the same to the table. Only these may be overridden by an agent's
 * `autoRoutingHint`; a `create_sheet` turn stays on the tool lane no matter
 * which agent is active.
 */
const HINT_OVERRIDABLE: ReadonlySet<string> = new Set(['direct', 'agentic']);

function gradeReasoning(rule: ReasoningRule, complexity: Complexity): ReasoningSetting {
  return typeof rule === 'string' ? rule : rule[complexity];
}

export interface AutoSelection {
  modelId: AutoLaneId;
  reasoning: ReasoningSetting;
}

export interface AutoSelectionInput {
  intent?: string | null | undefined;
  complexity?: Complexity | null | undefined;
  agentId?: string | null | undefined;
  /**
   * Surfaces that run no classifier and therefore have no intent. `notebook`
   * is RAG-grounded and pinned to the precise lane — the same choice the web
   * client makes locally in resolveAutoModel, kept here so a client that does
   * send `auto` doesn't silently land in the speed lane.
   */
  surface?: 'notebook' | null | undefined;
}

/**
 * Resolve `auto` to a concrete lane + reasoning strength.
 *
 * Order: surface pin → table lookup by intent → complexity grading → agent
 * hint override (neutral intents only).
 */
export function resolveAutoSelection(input: AutoSelectionInput): AutoSelection {
  const intent = input.intent ?? 'direct';
  const complexity = input.complexity ?? 'simple';

  if (input.surface === 'notebook') {
    return {
      modelId: MEDIUM,
      reasoning: gradeReasoning(graded('low', 'medium', 'high'), complexity),
    };
  }

  const entry = POLICY[intent] ?? DEFAULT_ENTRY;

  let modelId = entry.modelId;
  if (HINT_OVERRIDABLE.has(intent) && input.agentId) {
    const hint = getSystemAgent(input.agentId)?.autoRoutingHint;
    if (hint === 'precise') modelId = MEDIUM;
    else if (hint === 'creative') modelId = GEMMA;
    else if (hint === 'research') modelId = GEMMA;
  }

  return { modelId, reasoning: gradeReasoning(entry.reasoning, complexity) };
}

/**
 * ── Loop slot policy ────────────────────────────────────────────────────────
 * Declared here so planner, synth and the single-pass answer read as ONE
 * policy instead of two systems overriding each other. `providers.ts` turns
 * these into LanguageModel instances (it owns env + getModel).
 *
 * PLANNER: Mistral Small on REGOLO — Mistral Small always runs self-hosted, no
 * exceptions. The planner only calls tools and formulates queries (the synth
 * writes the prose), so Small's tool-calling is plenty.
 *
 * History worth knowing before touching this: an earlier attempt at the regolo
 * planner was reverted for a "steps=0 gather" regression — the planner returned
 * without calling any tool. It is back deliberately; the `afterGather`
 * guarantee in agenticRespondService now backstops "did it actually call the
 * generation tool", and tool calls were re-verified live on this lane. If
 * multi-step gather degrades again, bump the model here (mistral-medium-2604)
 * rather than moving the provider back.
 *
 * Trade-off accepted: Regolo has no Mistral prompt caching, so the planner's
 * fixed tool-usage prefix is re-billed every turn.
 *
 * litellm/verdigado-pro is the cross-provider fallback when regolo is absent.
 */
export const LOOP_PLANNER_PRIMARY = { provider: 'regolo' as const, model: 'mistral-small-4-119b' };
export const LOOP_PLANNER_FALLBACK = { provider: 'litellm' as const, model: 'verdigado-pro' };

/** SYNTH: best German writer, and never a reasoning lane (latency). gemma-4
 *  lives only on regolo; fall back to the always-up litellm lane. */
export const LOOP_SYNTH_PRIMARY = { provider: 'regolo' as const, model: 'gemma4-31b' };
export const LOOP_SYNTH_FALLBACK = { provider: 'litellm' as const, model: 'verdigado-pro' };

/** Models that must NEVER write the loop answer: reasoning/"think" lanes (slow),
 *  Chinese lanes (qwen — excluded by policy), and gpt-oss (verified tool-call
 *  fail / reasoning leak). Any of these in the synth slot is rewritten to the
 *  best-writer lane. Stays active even when the policy chose the model, so a
 *  policy pointing at gemma-litellm (→ verdigado-think) still lands on the
 *  fast gemma4-31b host. */
export const AVOID_AS_SYNTH = /verdigado-think|qwen|gpt-oss/i;
