/**
 * Grünerator-themed progress labels for the chat ProgressTracker.
 *
 * Each pipeline stage has a small pool of playful German phrases. One phrase
 * per stage is picked at the start of a chat turn (see `pickStageLabels`) and
 * stays stable for that turn, so the same stage feels fresh across messages
 * without flickering mid-stream.
 *
 * Register is mixed on purpose: cheeky for the fast stages (classify, image),
 * calmer for the longer ones (search, summary, response).
 */

import type { ProgressStage } from '../hooks/useChatGraphStream';

/** The stages that actually show a progress label (terminal stages don't). */
type LabelledStage = Extract<
  ProgressStage,
  | 'classifying'
  | 'searching'
  | 'generating_artifact'
  | 'summarizing'
  | 'generating_image'
  | 'generating'
>;

export const STAGE_LABEL_POOLS: Record<LabelledStage, readonly string[]> = {
  classifying: ['Sortiere …', 'Stricke …', 'Überlege …', 'Verstehe …'],
  searching: ['Durchsuche …', 'Stöbere …', 'Wälze …', 'Blättere …'],
  // Calm register on purpose: this is the longest stage of all (a full
  // structured generation, up to 90s), and a cheeky label wears out fast.
  generating_artifact: ['Baue …', 'Setze …', 'Gestalte …', 'Lege an …'],
  summarizing: ['Verdichte …', 'Bündele …', 'Fasse zusammen …'],
  generating_image: ['Male …', 'Zeichne …', 'Pinsele …', 'Mische …'],
  generating: ['Formuliere …', 'Schreibe …', 'Feile …', 'Tippe …'],
};

/**
 * Picks one label per stage. Call once per chat turn (e.g. at the top of the
 * model adapter's `run()`), then reuse the result for the whole turn.
 *
 * Returned as `Record<string, string>` so it drops in where the adapter
 * previously held a flat `STAGE_LABELS` map; unknown/terminal stages resolve
 * to `undefined`, which the adapter already guards against.
 */
export function pickStageLabels(): Record<string, string> {
  const resolved: Record<string, string> = {};
  for (const [stage, pool] of Object.entries(STAGE_LABEL_POOLS)) {
    resolved[stage] = pool[Math.floor(Math.random() * pool.length)];
  }
  return resolved;
}
