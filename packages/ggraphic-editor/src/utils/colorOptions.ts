// SPDX-License-Identifier: MPL-2.0
/**
 * The colours a picker offers come from the active brand pack. Pickers read
 * them as `ColorOption`s; the mapping is cached per pack, so a picker gets the
 * same array on every render.
 */
import { type BrandPack, type BrandSwatch } from '@ggraphic/core';

import { activeBrand } from '@ggraphic/editor/brand/brandRegistry';

/** One entry of a colour picker. */
export interface ColorOption {
  id: string;
  name: string;
  value: string;
}

const pickerOptions = new WeakMap<readonly BrandSwatch[], ColorOption[]>();
/** A pack's swatches as picker entries, the same array for the same pack. */
export function asColorOptions(swatches: readonly BrandSwatch[]): ColorOption[] {
  let options = pickerOptions.get(swatches);
  if (!options) {
    options = swatches.map(({ id, label, color }) => ({ id, name: label, value: color }));
    pickerOptions.set(swatches, options);
  }
  return options;
}

/** The active brand's colours, as every colour picker offers them. */
export const brandColors = (brand: BrandPack = activeBrand()): ColorOption[] =>
  asColorOptions(brand.palette);

/** The active brand's text colours. */
export const fontColors = (brand: BrandPack = activeBrand()): ColorOption[] =>
  asColorOptions(brand.textPalette);
