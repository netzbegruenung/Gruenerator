import { type NotebookDepth } from '@gruenerator/contracts';

export type NotebookDepthIconKey = 'fast' | 'deep' | 'ultra';

export interface NotebookDepthDef {
  depth: NotebookDepth;
  /** User-facing label. Web and mobile never relabel independently. */
  label: string;
  /** What the tier costs the user — shown next to the label, not as a tooltip. */
  description: string;
  icon: NotebookDepthIconKey;
}

/**
 * The tier a notebook surface starts on.
 *
 * Deliberately NOT in `@gruenerator/contracts`: the wire enum is the closed set
 * of values the backend accepts, and *that* answers an omitted `mode` with the
 * thorough tier (see `notebookStreamCore`). Which tier a fresh UI preselects is
 * a product choice on top of it and belongs to the UI layer that makes it.
 */
export const DEFAULT_NOTEBOOK_DEPTH: NotebookDepth = 'fast';

/**
 * Notebook retrieval depth — the presentation half of `notebookDepthSchema`.
 *
 * The ids are the wire enum (F0, see CLAUDE.md); only labels and descriptions
 * live here. The numbers behind each tier — how many candidates are retrieved,
 * the similarity cut, how many formulations are searched — stay server-side in
 * `apps/api/config/notebookDepthProfiles.ts`, so tuning retrieval never ships a
 * new client bundle.
 *
 * Its own leaf module rather than `composerControls`: the persisted preference
 * lives in `chatStore`, and `composerControls` already reads that store's types.
 */
export const NOTEBOOK_DEPTHS: NotebookDepthDef[] = [
  {
    depth: 'fast',
    label: 'Klein',
    description: 'Eine Suche, knappe Antwort',
    icon: 'fast',
  },
  {
    depth: 'deep',
    label: 'Mittel',
    description: 'Mehr Quellen, ausführliche Antwort',
    icon: 'deep',
  },
  {
    depth: 'ultra',
    label: 'Ultra',
    description: 'Mehrere Formulierungen, breitester Quellenkorpus',
    icon: 'ultra',
  },
];

/**
 * The tier's presentation, falling back to the default for an unknown id.
 *
 * The fallback is load-bearing, not defensive noise: the choice is persisted, so
 * a tier this build no longer knows can be read back from storage — and putting
 * that id on the wire would fail the whole request at the contract.
 */
export function notebookDepthDef(depth: NotebookDepth | undefined): NotebookDepthDef {
  return (
    NOTEBOOK_DEPTHS.find((d) => d.depth === depth) ??
    NOTEBOOK_DEPTHS.find((d) => d.depth === DEFAULT_NOTEBOOK_DEPTH)!
  );
}
