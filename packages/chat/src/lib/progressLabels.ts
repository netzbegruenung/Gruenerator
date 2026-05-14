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
  'classifying' | 'searching' | 'summarizing' | 'generating_image' | 'generating'
>;

export const STAGE_LABEL_POOLS: Record<LabelledStage, readonly string[]> = {
  classifying: [
    'Sortiere dein Anliegen …',
    'Stricke einen Plan …',
    'Lese zwischen den Zeilen …',
    'Denke kurz nach …',
  ],
  searching: [
    'Stöbere im Archiv …',
    'Wälze die Parteiprogramme …',
    'Durchforste die Quellen …',
    'Blättere durch die Anträge …',
  ],
  summarizing: [
    'Bündele die Argumente …',
    'Koche es auf den Punkt ein …',
    'Fasse das Wichtigste zusammen …',
  ],
  generating_image: [
    'Mische die Farben …',
    'Werfe Farbbeutel auf die Leinwand …',
    'Spanne die Leinwand auf …',
    'Male dein Sharepic …',
  ],
  generating: ['Formuliere die Antwort …', 'Feile an den Worten …', 'Bringe es aufs Papier …'],
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
