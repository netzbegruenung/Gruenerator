import { type ComposedSharepic } from '@gruenerator/canvas-editor/composer';
import {
  type SharepicPatchOp,
  type SharepicPhotoAttribution,
  type SharepicSpec,
} from '@gruenerator/contracts';

/** Review rounds per turn. Two catch most problems; more mostly churns. */
export const MAX_REVIEWS = 2;

export interface RevisionDeps {
  compose: (
    spec: SharepicSpec,
    attributions: (SharepicPhotoAttribution | null)[]
  ) => Promise<ComposedSharepic>;
  /** Null when any slide failed to render. */
  render: (composed: ComposedSharepic) => Promise<string[] | null>;
  /** Null when the review could not run (no contact sheet, request failed). */
  review: (input: {
    spec: SharepicSpec;
    brief: string;
    previews: string[];
  }) => Promise<{ ok: boolean; issues: string[]; patch: SharepicPatchOp[] } | null>;
  applyPatch: (spec: SharepicSpec, patch: SharepicPatchOp[]) => SharepicSpec;
}

export interface RevisionResult {
  spec: SharepicSpec;
  composed: ComposedSharepic;
  /** Null when the render failed. */
  previews: string[] | null;
  /** The issues the review raised, in order. */
  hinweise: string[];
}

/**
 * Composes and renders a spec, then lets the vision review patch it for up to
 * MAX_REVIEWS rounds. Null when aborted.
 */
export async function reviseWithReview(input: {
  spec: SharepicSpec;
  attributions: (SharepicPhotoAttribution | null)[];
  brief: string;
  deps: RevisionDeps;
  signal?: AbortSignal;
}): Promise<RevisionResult | null> {
  const { attributions, brief, deps, signal } = input;
  let spec = input.spec;
  const hinweise: string[] = [];
  let composed = await deps.compose(spec, attributions);
  let previews = await deps.render(composed);
  for (let round = 0; previews && round < MAX_REVIEWS; round++) {
    if (signal?.aborted) return null;
    const review = await deps.review({ spec, brief, previews });
    if (signal?.aborted) return null;
    if (!review || review.ok) break;
    hinweise.push(...review.issues);
    const patched = deps.applyPatch(spec, review.patch);
    if (patched === spec) break;
    spec = patched;
    composed = await deps.compose(spec, attributions);
    previews = await deps.render(composed);
  }
  if (signal?.aborted) return null;
  return { spec, composed, previews, hinweise };
}
