/**
 * What each notebook search depth actually does.
 *
 * The ids come from `notebookDepthSchema` (@gruenerator/contracts); the numbers
 * stay here because they are server-side tuning, not part of the wire contract.
 *
 * The tiers differ on one axis above all: how many candidates reach the
 * cross-encoder. `fast` is deliberately byte-identical to the pre-tier
 * behaviour — the Grün-O-Mat surface runs on it (`mode: 'fast'` in
 * gruenOMatController) and is not part of this change.
 */
import { type NotebookDepth } from '@gruenerator/contracts';

import { type SearchParams } from './systemCollectionsConfig.js';

export interface NotebookDepthProfile {
  /** Per-collection Qdrant result limit. */
  searchLimit: number;
  /**
   * Floor for the pre-filter recall window. A collection configured with a
   * larger `recallLimit` keeps its own — the tier raises, never lowers.
   */
  recallLimitFloor: number;
  /** Similarity cut, applied both inside search and when sorting candidates. */
  threshold: number;
  /** Candidates kept after dedup + sort, before reranking. */
  sortLimit: { single: number; multi: number };
  /** Candidates handed to the cross-encoder. */
  rerankInput: number;
  /** Passages that survive into the prompt. */
  rerankOutput: number;
  /**
   * Ausgabe-Wunsch der Stufe, keine Zusage. Liegt er über der Decke des
   * Modells, das die Lane auflöst, kürzt `clampToModelOutputLimit`
   * (services/ai/modelOutputLimits.ts) darauf herunter — Mistral
   * Medium 3.5 nimmt hier höchstens 16.384 an, andere Lanes mehr. Die Zahl darf
   * deshalb großzügig bleiben; sie ist auf die Stufe getunt, nicht auf das
   * Modell.
   */
  maxOutputTokens: number;
  /** Shrink the answer to match a shrunken context. */
  conciseAnswer: boolean;
  /**
   * How many formulations of the question are searched in parallel — 1 means
   * the user's wording only, no reformulation.
   */
  queryVariants: number;
}

const PROFILES: Record<NotebookDepth, NotebookDepthProfile> = {
  fast: {
    searchLimit: 30,
    recallLimitFloor: 50,
    threshold: 0.35,
    sortLimit: { single: 30, multi: 40 },
    rerankInput: 20,
    rerankOutput: 10,
    maxOutputTokens: 20000,
    conciseAnswer: true,
    queryVariants: 1,
  },
  deep: {
    searchLimit: 40,
    recallLimitFloor: 80,
    threshold: 0.35,
    sortLimit: { single: 40, multi: 60 },
    rerankInput: 40,
    rerankOutput: 18,
    maxOutputTokens: 40000,
    conciseAnswer: false,
    queryVariants: 1,
  },
  ultra: {
    searchLimit: 60,
    recallLimitFloor: 150,
    threshold: 0.28,
    sortLimit: { single: 80, multi: 100 },
    rerankInput: 80,
    rerankOutput: 24,
    maxOutputTokens: 40000,
    conciseAnswer: false,
    queryVariants: 3,
  },
};

export function getNotebookDepthProfile(depth: NotebookDepth): NotebookDepthProfile {
  return PROFILES[depth];
}

/**
 * Widen a collection's search parameters to the tier. `recallLimit` takes the
 * larger of the two so a collection tuned for deeper recall keeps it, and
 * `qualityMin` — the per-collection quality floor, a different axis from the
 * similarity cut — is left alone.
 */
export function applyDepthProfile(
  params: SearchParams,
  profile: NotebookDepthProfile | undefined
): SearchParams {
  if (!profile) return params;
  return {
    ...params,
    limit: profile.searchLimit,
    threshold: profile.threshold,
    recallLimit: Math.max(params.recallLimit, profile.recallLimitFloor),
  };
}
