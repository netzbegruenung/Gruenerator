// SPDX-License-Identifier: MPL-2.0
/**
 * The brand packs the host renders. The first supplies what a new element
 * starts with (picker palettes, marker boxes, chart series, default colours
 * and fonts); every registered pack is known to rendering, since a document
 * of any of them can be open. A module-level register rather than a field in
 * `CanvasEditorServices`, because the defaults are read in commands, factories
 * and offscreen roots that have no React context. Without a host the editor
 * renders `brandDefault`.
 */
import { brandDefault, type BrandPack } from '@ggraphic/core';

let registered: readonly [BrandPack, ...BrandPack[]] = [brandDefault];

export function registerBrandPacks(packs: readonly [BrandPack, ...BrandPack[]]): void {
  registered = packs;
}

/** The pack new elements take their defaults from. */
export function activeBrand(): BrandPack {
  return registered[0];
}

export function registeredBrands(): readonly BrandPack[] {
  return registered;
}
