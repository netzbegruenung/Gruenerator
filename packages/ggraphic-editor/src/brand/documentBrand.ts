// SPDX-License-Identifier: MPL-2.0
/**
 * The brand of the document that is open, for the panels that offer defaults
 * (swatches, effect presets, text tiles). The shell provides the active page's
 * `FullCanvasConfig.brand`; where nothing is provided, or the page names no
 * pack, a panel falls back to the active brand (`activeBrand()`).
 *
 * Code without React context takes the brand as a parameter instead: the
 * action factories get it from the config.
 */
import { type BrandPack } from '@ggraphic/core';
import { createContext, useContext } from 'react';

import { activeBrand } from '@ggraphic/editor/brand/brandRegistry';

export const DocumentBrandContext = createContext<BrandPack | null>(null);

export function useDocumentBrand(): BrandPack {
  return useContext(DocumentBrandContext) ?? activeBrand();
}
