// SPDX-License-Identifier: MPL-2.0
/**
 * Umrechnung Seiten-px → PowerPoint-Einheiten und Farben → pptxgenjs-Hex.
 * Die Folie ist `LAYOUT_WIDE` (13,333 × 7,5 in): `inch = px * 13.333 / page.width`.
 */

export const SLIDE_WIDTH_IN = 13.333;
const POINTS_PER_INCH = 72;

export interface PptxUnits {
  /** px → Zoll */
  inch: (px: number) => number;
  /** px → Punkt (Schriftgrößen, Linien, Schatten) */
  pt: (px: number) => number;
}

export function pptxUnits(pageWidth: number): PptxUnits {
  const perPx = SLIDE_WIDTH_IN / pageWidth;
  return {
    inch: (px) => px * perPx,
    pt: (px) => px * perPx * POINTS_PER_INCH,
  };
}

export interface PptxColor {
  /** `RRGGBB` ohne `#`, wie pptxgenjs es will. */
  hex: string;
  /** 0..1 */
  alpha: number;
}

const toHex = (n: number) =>
  Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .padStart(2, '0');

/**
 * `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()`/`rgba()` → Hex plus Deckkraft.
 * `transparent` und Unlesbares → null; der Aufrufer lässt die Füllung dann weg.
 */
export function parseColor(value: string | null): PptxColor | null {
  if (!value) return null;
  const color = value.trim();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(color);
  if (short) {
    return {
      hex: `${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toUpperCase(),
      alpha: 1,
    };
  }
  const long = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(color);
  if (long) {
    return {
      hex: long[1]!.toUpperCase(),
      alpha: long[2] ? parseInt(long[2], 16) / 255 : 1,
    };
  }
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i.exec(
    color
  );
  if (rgb) {
    const a = rgb[4];
    const alpha = a === undefined ? 1 : a.endsWith('%') ? parseFloat(a) / 100 : parseFloat(a);
    return {
      hex: `${toHex(Number(rgb[1]))}${toHex(Number(rgb[2]))}${toHex(Number(rgb[3]))}`.toUpperCase(),
      alpha: Math.max(0, Math.min(1, alpha)),
    };
  }
  return null;
}

/** Deckkraft 0..1 → pptxgenjs-Transparenz 0..100. */
export const transparencyOf = (opacity: number): number =>
  Math.round(Math.max(0, Math.min(1, 1 - opacity)) * 100);

/** PowerPoint schreibt Drehungen als 0..360°; negative Werte zeigen nicht alle Programme. */
export const pptxRotation = (degrees: number): number => ((degrees % 360) + 360) % 360;
