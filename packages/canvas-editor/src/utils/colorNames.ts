import { BRAND_COLORS } from './shapes';

/** German name of a brand colour, otherwise "Farbe #RRGGBB" — for swatch `aria-label`s. */
export function colorName(hex: string): string {
  const brand = BRAND_COLORS.find((c) => c.value.toLowerCase() === hex.toLowerCase());
  return brand ? brand.name : `Farbe ${hex.toUpperCase()}`;
}
