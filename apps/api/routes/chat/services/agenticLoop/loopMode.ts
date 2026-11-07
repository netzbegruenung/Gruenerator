/**
 * Die Modus-Wahl des Turns: unified (ein Modell hält die Werkzeuge UND schreibt
 * die Antwort in einem Strom) oder split (fester schneller Planer sammelt, das
 * gewählte Modell schreibt danach ohne Werkzeuge).
 */
import { prefersUnifiedLoop } from '../../agents/providers.js';

import { type LoopMode } from './loopEngine.js';

/**
 * Whether the turn's own material outweighs the instructions around it.
 *
 * The observed degeneration needs three things together: the unified loop, the
 * full tool catalog in the writing context, and a task whose material is large
 * enough that the answer is long and highly structured. Live 13.08.2026 the
 * same 11.191-char paste looped four times through the unified path and stayed
 * clean every time the writer ran without the catalog. The offline probe
 * closes the argument from the other side: the same model, the same prompt,
 * no tools — 15 of 15 clean.
 *
 * The comparison is against the system prompt rather than a tuned constant on
 * purpose. It asks a question with a meaning: does this turn consist of a
 * QUESTION to answer, or of MATERIAL to work on? Once the material is the
 * larger half, the writing phase is the expensive part and it deserves a clean
 * context — and the threshold moves by itself whenever the prompt does.
 *
 * Nothing is lost by switching: split still runs the whole tool phase on the
 * planner, so the turn can search exactly as before. Only the writer loses the
 * catalog it had no use for.
 *
 * Carried documents count as material even though they arrive INSIDE the system
 * message. Measured 13.08.2026 07:23: once a pasted article is persisted and
 * re-injected as `FRÜHERE DOKUMENTE`, the base prompt grows from 3.414 to 14.554
 * chars — and the follow-up asking to check that article ("Erstelle
 * ausschließlich diese Tabelle", 712 chars) suddenly reads as a small question
 * next to a huge instruction block. The predicate would flip to "not material
 * heavy" for exactly the turns that need the clean writer most, and the fix for
 * the missing context would have quietly re-armed the loop.
 *
 * The material is the same material either side of the boundary; which channel
 * carried it into the prompt says nothing about the turn.
 *
 * What it does say something about: whether the material is in the prompt AT
 * ALL. A large attachment is vectorized and then re-injected NOWHERE — that is
 * the case the sentence above does not cover, and `turnMaterialChars` excludes
 * it for that reason. This predicate must never be handed a number that counts
 * it. Fed one, it strips the writer's tool catalog to protect material the
 * writer does not have, and the answer says so.
 *
 * Measured 05.11.2026 (plan unified-loop, task 6.1): with this predicate forced
 * to false, `ul-paste-umbau` ran ten times as a unified Gemma 4 31B turn on
 * Melious with `noDegeneration` green 10/10 (`ul-paste-lektorat` routes single
 * pass and never reached it). The exception stays anyway: a degenerated answer
 * over pasted material costs more than the split writer's extra step.
 */
export function materialDominatesTurn(
  userText: string,
  systemMessage: string,
  carriedMaterialChars = 0
): boolean {
  return userText.length + carriedMaterialChars > systemMessage.length - carriedMaterialChars;
}

/**
 * Mistral (fast native tool-caller) runs the unified single-model loop; every
 * other model runs the planner/executor split — the fast planner (`standard`
 * intermediate stage) gathers, the selected model writes the answer.
 *
 * ...unless the turn's own material outweighs the instructions around it. Then
 * split wins for a different reason: its writer runs WITHOUT the tool catalog,
 * and that is the only configuration in which this failure has never been
 * observed (see materialDominatesTurn). The caller computes
 * `carriedMaterialChars` BEFORE resolving the model, so the lane and the loop
 * mode cannot read different numbers.
 *
 * Split also wins for a turn that carries a guarantee (a forced artifact, edit
 * or pinned tool): the hook runs BEFORE the writer there, so the writer
 * announces what exists instead of what is still to come.
 *
 * Headless runs (recurring task, board agent, notebook precision) used to split
 * too, on the reasoning that nobody reads a streamed-then-replaced answer. That
 * did not hold: they read `outcome.fullText`, which a unified repair rewrites
 * (`emitter.setText`), and the notebook client takes the closing `completion`
 * over the streamed deltas (`parseSSEStream`). Dropped 11/2026 (#5441).
 */
export type LoopModeReason = 'unified_model' | 'not_unified_model' | 'material_heavy' | 'guarantee';

export function resolveLoopMode(input: {
  provider: string;
  modelName: string;
  materialHeavy: boolean;
  /** The turn owes an artifact/edit/tool the split loop's `afterGather` hook
   *  guarantees BEFORE the writer runs (see `turnCarriesGuarantee`). */
  carriesGuarantee: boolean;
}): { mode: LoopMode; reason: LoopModeReason } {
  if (!prefersUnifiedLoop(input.provider, input.modelName)) {
    return { mode: 'split', reason: 'not_unified_model' };
  }
  if (input.materialHeavy) return { mode: 'split', reason: 'material_heavy' };
  if (input.carriesGuarantee) return { mode: 'split', reason: 'guarantee' };
  return { mode: 'unified', reason: 'unified_model' };
}
