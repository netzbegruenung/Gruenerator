/**
 * Context window to budget against BEFORE the model is resolved.
 *
 * The single-pass path resolves its lane first and prunes second, so it prunes
 * against the real window (`resolution.contextWindow`, see responseSinglePass).
 * The agentic path cannot: `resolveModel` lives inside `streamAgenticResponse`,
 * which runs AFTER `pruneMessages`. It therefore budgeted against whatever
 * `getContextWindow('auto')` returns — `DEFAULT_CONTEXT_WINDOW`, 32.768 — and
 * the live log proves the ordering:
 *
 *   produktion:  auto → gemma-litellm …        then  Trimmed … 646/180500
 *   agentic:     Trimmed … 1345/19937          then  auto → gemma-litellm …
 *
 * Same lane, same model, an eighth of the budget. Two things followed from it:
 * the history was pruned to ~20k tokens, and `getCompactionTokenThreshold`
 * (`min(window × 0,4, 24000)`) fired at 13.107 instead of 24.000 tokens — so
 * agentic threads were summarised roughly twice as early as single-pass ones,
 * and a summary REPLACES the turns it covers.
 *
 * WHY A FLOOR AND NOT THE REAL WINDOW. Mirroring `resolveAutoSelection` here to
 * predict the lane would mean recomputing its inputs (`turnMaterialChars` among
 * them, which agenticRespondService already flags as a "two computations could
 * disagree" hazard), and hoisting `resolveModel` itself would hold the Verdigado
 * inference slot across pruning AND compaction — compaction can start an LLM
 * call. Both buy exactness with a coupling that drifts. A floor needs neither:
 * it is a pure table lookup, and being too small only ever prunes more, while
 * being too large runs Verdigado into a SILENT truncation (HTTP 200,
 * `prompt_tokens` collapses to ~64Ki, nothing says so — see CTX_VERDIGADO).
 *
 * WHAT THE FLOOR BUYS BEYOND THE NUMBER. It also keeps the split-mode PLANNER
 * inside its own window. The planner (`mistral-small-3.2-24b-instruct-2506` via
 * GreenPT, see LOOP_PLANNER_PRIMARY) does not go through `AVAILABLE_MODELS` at
 * all — nothing bounds what the loop sends it, and until now only the 32k
 * accident kept it safe. Budgeting against the SMALLEST lane keeps the history
 * under that model's window too. Anyone raising this to the resolved lane's
 * real window (262k on the Gemma lanes) must measure the planner first — a
 * needle test, the way CTX_VERDIGADO was measured.
 *
 * NOT considered: the first-token-timeout `fallback` of a single lane. It would
 * be the stricter reading — `mistral-small-4` falls back to `gpt-oss`, i.e. onto
 * the 120k Verdigado side, and the GEMMA_4_REGOLO comment records exactly that
 * shape as a live silent truncation. It is left out because honouring it here
 * and nowhere else would make the agentic path quietly stricter than the
 * single-pass path for the same explicit model, and because it currently changes
 * no value: the auto floor is already the Verdigado window. Fix it for both
 * paths in `resolveModelTuple`, not for one path here.
 */
import { AVAILABLE_MODELS, getModelConfig, type ModelConfig } from '../agents/providers.js';

/** Smallest window this lane can serve. For an overflow lane the slot decides
 *  which side runs, so the smaller one bounds the prompt — `contextWindow` is
 *  documented as the conservative (primary) side, and this asserts it rather
 *  than assuming it. */
function laneFloor(config: ModelConfig): number {
  return config.kind === 'overflow'
    ? Math.min(config.contextWindow, config.overflowContextWindow)
    : config.contextWindow;
}

/** Floor across every lane the auto policy could land on. Computed from the
 *  table rather than from the policy's branches so a new lane cannot slip past
 *  it: a lane that exists is a lane this bound already covers. */
function autoFloor(): number {
  let min = Infinity;
  for (const config of Object.values(AVAILABLE_MODELS)) min = Math.min(min, laneFloor(config));
  return Number.isFinite(min) ? min : 0;
}

/**
 * Conservative context window for a turn whose lane is not resolved yet.
 *
 * A FLOOR, never a ceiling: callers take the larger of this and whatever they
 * already know, so this can only ever widen a budget that was too narrow.
 *
 * @param modelId  the request's model selection; `auto`/`mistral`/absent mean
 *                 the policy has not chosen yet — see `resolveModel`.
 * @returns tokens, or `null` when nothing is known (caller keeps its own value)
 */
export function resolveLaneContextFloor(modelId: string | null | undefined): number | null {
  const isAuto = !modelId || modelId === 'mistral' || modelId === 'auto';
  if (isAuto) {
    const floor = autoFloor();
    return floor > 0 ? floor : null;
  }
  const config = getModelConfig(modelId);
  if (!config) return null; // unknown id — resolveModel falls back too
  return laneFloor(config);
}
