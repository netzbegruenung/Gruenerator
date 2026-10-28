// SPDX-License-Identifier: MPL-2.0
import { brandColors } from '@ggraphic/editor/utils/colorOptions';

/** German name of a brand colour, otherwise "Farbe #RRGGBB" — for swatch `aria-label`s. */
export function colorName(hex: string): string {
  const brand = brandColors().find((c) => c.value.toLowerCase() === hex.toLowerCase());
  return brand ? brand.name : `Farbe ${hex.toUpperCase()}`;
}
