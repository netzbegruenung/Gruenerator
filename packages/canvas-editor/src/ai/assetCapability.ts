/**
 * Asset capability helper for AI prompts.
 *
 * Exposes the canvas-editor's static asset registry (sunflower variants,
 * quote mark, arrow…) as `{id, label}` pairs the LLM can target via
 * `add-asset` operations.
 *
 * Per-template `recommendedAssetIds` (from CANVAS_RECOMMENDED_ASSETS) take
 * priority — they're listed first so the AI prefers brand-appropriate
 * assets for the active template.
 */
import { ALL_ASSETS, CANVAS_RECOMMENDED_ASSETS } from '../utils/canvasAssets';

import type { CanvasAiNamedOption } from './types';

export function buildAssetCapability(canvasType: string): CanvasAiNamedOption[] {
  const recommendedIds = CANVAS_RECOMMENDED_ASSETS[canvasType] ?? [];
  const recommendedSet = new Set(recommendedIds);
  const assetById = new Map(ALL_ASSETS.map((a) => [a.id, a]));

  const recommended: CanvasAiNamedOption[] = recommendedIds.flatMap((id) => {
    const a = assetById.get(id);
    return a ? [{ id: a.id, label: a.label }] : [];
  });

  const others: CanvasAiNamedOption[] = ALL_ASSETS.filter((a) => !recommendedSet.has(a.id)).map(
    (a) => ({ id: a.id, label: a.label })
  );

  return [...recommended, ...others];
}
