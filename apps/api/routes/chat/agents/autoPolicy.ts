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
 *   - summary → summarizeNode already runs on the `heavy` intermediate stage.
 *
 * ── Second-order effect ─────────────────────────────────────────────────────
 * `prefersUnifiedLoop` is true only for Mistral. Picking a Mistral lane
 * therefore also selects the UNIFIED loop (one model does tools + prose);
 * every other lane runs the split (fixed planner gathers, synth writes).
 */

import { getSystemAgent } from '@gruenerator/shared/agents';

import type { SearchIntent } from '@gruenerator/contracts';

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

/**
 * Input size (tokens) above which an overflow lane must run on its HOSTED
 * (Regolo) side instead of self-hosted Verdigado.
 *
 * Verdigado is declared at 64k (CTX_VERDIGADO — deliberately below the point
 * where Ollama was observed to truncate silently), so its pruning budget is
 * `0.7 * 64k - 3000` ≈ 41.8k. A larger request does not fail there, it gets
 * *pruned down* to fit while a lane with a 262k window sat available. That is
 * the silent context loss this threshold exists to prevent.
 *
 * Kept as a literal (not derived from providers.ts) because this module is
 * deliberately import-free so `providers.ts` can depend on it without a cycle.
 * Change it together with CTX_VERDIGADO there.
 */
export const VERDIGADO_INPUT_LIMIT = 40_000;

/** A scalar applies to every complexity; the record grades by it. */
type ReasoningRule = ReasoningSetting | Record<Complexity, ReasoningSetting>;

/** Keys into AVAILABLE_MODELS (providers.ts). Not the user-facing catalog. */
export type AutoLaneId = 'gemma-4-26b' | 'gemma-litellm' | 'mistral-medium-3.5' | 'litellm';

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
 * Gemma 4 31B (Regolo) is now the single content-answer lane. Lane A (Gemma 4
 * 26B, Scaleway) and Lane D (GPT-OSS) were folded into it on 07.08.2026: both
 * were picked for speed over a small/latency-critical prose share, and Gemma 4
 * on Regolo matches that latency (4.0s end to end, measured 2026-07-31)
 * without GPT-OSS's known weakness — it answers a forced tool call with prose,
 * which is what put a production PDF generation on the floor (see the artefact
 * note in services/ai/lanes.ts). `gemma-4-26b` and `litellm` stay registered in
 * providers.ts (persisted ids, intermediate stages) but are no longer an
 * auto-policy target.
 */
const GEMMA: AutoLaneId = 'gemma-litellm';
/** Mistral Medium 3.5. Where the model calls tools ITSELF and the unified loop
 *  should kick in, and — since 07.08.2026 — `compute`: narrating pre-computed
 *  figures without letting the writer invent its own arithmetic needs the more
 *  careful lane, not the speed one. See the `compute` entry below for the
 *  incident that motivated it. */
const MEDIUM: AutoLaneId = 'mistral-medium-3.5';

/**
 * Intents the auto model genuinely cannot influence — the ONLY legitimate
 * reason to be absent from the table.
 *
 * Being a hand-written `Record<string, AutoEntry>` meant "deliberately absent"
 * and "forgotten" looked identical, and both silently took DEFAULT_ENTRY. Two
 * intents were in fact forgotten (`hilfe`, `create_pdf`) and nobody could tell.
 * With the exemption named, the table is exhaustive over SearchIntent and a new
 * intent breaks the build until someone decides.
 */
export const AUTO_POLICY_EXEMPT = ['sharepic'] as const satisfies readonly SearchIntent[];
type ExemptIntent = (typeof AUTO_POLICY_EXEMPT)[number];

/**
 * Exported for the drift guard in autoPolicy.vitest.ts.
 *
 * The type already forces completeness at compile time; the runtime guard used
 * to re-check it by resolving an unknown intent and comparing the RESULT to
 * each real intent's result. That only worked while DEFAULT_ENTRY's lane was
 * unique — pointing the default at Gemma 4 made two legitimate Gemma intents
 * look like silent fallthroughs. Checking the keys is what the guard actually
 * means.
 */
export const POLICY: Record<Exclude<SearchIntent, ExemptIntent>, AutoEntry> = {
  // ── Content answers: Gemma 4 (31B, Regolo) ──
  // Synth summarises tool output; the planner makes the MCP calls.
  mcp: { modelId: GEMMA, reasoning: 'off' },
  // summarizeNode runs on the `heavy` intermediate stage — same tier.
  summary: { modelId: GEMMA, reasoning: 'off' },
  chat_history: { modelId: GEMMA, reasoning: 'off' },
  // Narration over an artefact that is already IN CONTEXT (numbers, chart data,
  // scraped text). The premise is load-bearing: this lane REPEATS figures, it
  // does not produce them. A turn on 02.08.2026 broke it — one figure had been
  // computed, five were narrated — and the writer filled the gap with
  // arithmetic of its own, marking `42.000 + 84.000 = 120.000` as correct. Moved
  // to Mistral Medium on 07.08.2026 rather than staying on the shared prose
  // lane, so a regression here can't ride in on a change tuned for the other
  // content intents. The upstream fix still stands (computeArithmeticBatch
  // checks every claim, and the answer rule forbids ruling on anything outside
  // the checked block) — this is belt-and-braces, not a replacement for it.
  compute: { modelId: MEDIUM, reasoning: 'off' },
  chart: { modelId: GEMMA, reasoning: 'off' },
  scrape_url: { modelId: GEMMA, reasoning: 'off' },
  // Structured facts from system MCP sources — reporting, not writing.
  bahn: { modelId: GEMMA, reasoning: 'off' },
  wetter: { modelId: GEMMA, reasoning: 'off' },
  hotel: { modelId: GEMMA, reasoning: 'off' },
  reise: { modelId: GEMMA, reasoning: 'off' },
  umfragen: { modelId: GEMMA, reasoning: 'off' },
  // Reporting retrieved documentation sections back — the same shape as `mcp`
  // above (planner fetches, synth summarises).
  hilfe: { modelId: GEMMA, reasoning: 'off' },
  // `research_wrapper` lived here while a research turn only framed a
  // ready-made answer in two sentences. With the research/web merge the model
  // writes the whole answer from raw sources, so a research turn is ordinary
  // synthesis and takes the default lane like `web` does.

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
  // Same family as its three siblings above: generate structured content AND
  // narrate a platform action the model cannot see in its context. It was the
  // only create_* intent missing from the table, so it took the speed lane —
  // exactly the setup the Lane C note documents as producing capability
  // refusals ("Ich kann keine neuen Dateien erstellen") while the artefact is
  // created anyway.
  create_pdf: { modelId: MEDIUM, reasoning: graded('medium', 'high', 'high') },
  // The router rewrites this to `agentic`; kept as a safety net.
  modify_board: { modelId: MEDIUM, reasoning: 'medium' },
  // The vision override in resolveModel wins over this anyway.
  image_edit: { modelId: MEDIUM, reasoning: 'off' },

  // ── Speed lane, folded into Gemma 4 on 07.08.2026 (see the lane comment above) ──
  // Same grading as before: the substance is in the message, so the work is
  // formulating, not reasoning — but a complex rewrite still earns `low`.
  produktion: { modelId: GEMMA, reasoning: graded('off', 'off', 'low') },
  direct: { modelId: GEMMA, reasoning: graded('off', 'off', 'low') },
  // Ungraded, unlike `direct`: a greeting has no complexity axis to grade on —
  // the gate that produces it only fires when the message is a greeting and
  // nothing else. Spending reasoning tokens on "Hallo" is pure latency.
  greeting: { modelId: GEMMA, reasoning: 'off' },
};

/**
 * Unknown/absent intent → Gemma 4.
 *
 * This was the GPT-OSS speed lane until the 2026-07-31 wind-down. A catch-all
 * is exactly where GPT-OSS is most dangerous: an unlisted intent may well be
 * one that forces a tool call, and GPT-OSS answers those with prose. Gemma 4 on
 * Regolo costs no meaningful latency here (4.0s) and writes the better German.
 */
const DEFAULT_ENTRY: AutoEntry = { modelId: GEMMA, reasoning: graded('off', 'off', 'low') };

/**
 * Intents with no inherent task shape. Only these may be overridden by an
 * agent's `autoRoutingHint`; a `create_sheet` turn stays on the tool lane no
 * matter which agent is active. `greeting` is listed because it was part of
 * `direct` when this set was written — an agent that pins a lane for voice
 * consistency should keep getting it on "Hallo" too.
 */
const HINT_OVERRIDABLE: ReadonlySet<string> = new Set([
  'produktion',
  'direct',
  'greeting',
  'agentic',
]);

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
  const intent = input.intent ?? 'produktion';
  const complexity = input.complexity ?? 'simple';

  if (input.surface === 'notebook') {
    return {
      modelId: MEDIUM,
      reasoning: gradeReasoning(graded('low', 'medium', 'high'), complexity),
    };
  }

  // `intent` arrives as a wire string, so the lookup is a genuine boundary: the
  // table is exhaustive over SearchIntent at COMPILE time, but nothing stops a
  // caller passing something else at runtime, and that must still resolve to
  // the speed lane rather than throw.
  const entry = (POLICY as Partial<Record<string, AutoEntry>>)[intent] ?? DEFAULT_ENTRY;

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
