// SPDX-License-Identifier: MPL-2.0
/**
 * Curated illustration capability for AI prompts.
 *
 * The full illustration registry has far too many entries for an LLM prompt,
 * so the host names the few ids the AI may reference
 * (`CanvasAssetCatalog.illustrations.aiPicks`, installed with
 * `registerAssetCatalog`); without a host the AI is offered none.
 *
 * The applier (utils/illustrations/registry.createIllustration) resolves an id
 * at apply time.
 */
import { registeredAssetCatalog } from '@ggraphic/editor/utils/canvasAssets';

import type { CanvasAiNamedOption } from '@ggraphic/editor/ai/types';

/**
 * Build the AI illustration capability list: `{id, label}` pairs the LLM can
 * use for `add-illustration` operations.
 */
export function buildIllustrationCapability(): CanvasAiNamedOption[] {
  return [...(registeredAssetCatalog().illustrations?.aiPicks ?? [])];
}
