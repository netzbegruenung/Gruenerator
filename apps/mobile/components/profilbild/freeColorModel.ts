import { type FreeBackground, type Swatch } from '@gruenerator/shared/profilbild';

/** Hues of the free colour grid, in degrees: twelve steps around the wheel. */
const HUES = Array.from({ length: 12 }, (_, i) => i * 30);
/** Lightness rows of the grid, dark to light, at full-ish saturation. */
const LIGHTNESS = [25, 40, 55, 70, 85];

const hex2 = (n: number) =>
  Math.round(n * 255)
    .toString(16)
    .padStart(2, '0');

/** HSL (degrees, percent, percent) as `#rrggbb` — lowercase, like the saved format. */
export function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100;
  const light = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const f = (n: number) => light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return `#${hex2(f(0))}${hex2(f(8))}${hex2(f(4))}`;
}

/**
 * The free colour picker without a native colour input: one row per lightness,
 * twelve hues each, plus a grey row — enough to land near any colour.
 */
export function freeColorGrid(): string[][] {
  return [
    ...LIGHTNESS.map((l) => HUES.map((h) => hslToHex(h, 80, l))),
    [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100].map((l) => hslToHex(0, 0, l)),
  ];
}

export interface PaletteColor {
  hex: string;
  label: string;
}

/** The country's CD colours as quick picks — the plain colours of its swatches. */
export function cdPalette(swatches: Swatch[]): PaletteColor[] {
  return swatches.flatMap((s) =>
    s.background.kind === 'color' ? [{ hex: s.background.color.toLowerCase(), label: s.label }] : []
  );
}

export const GRADIENT_DIRECTIONS = [
  { angle: 180, label: 'Von oben nach unten', rotate: 0 },
  { angle: 135, label: 'Diagonal', rotate: -45 },
  { angle: 90, label: 'Von links nach rechts', rotate: -90 },
] as const;

/** What the free tile starts from: the current free choice of its mode, else the first CD colours. */
export function freeDefaults(
  value: FreeBackground | null,
  palette: PaletteColor[]
): { color: string; gradient: Extract<FreeBackground, { kind: 'gradient' }> } {
  const first = palette[0]?.hex ?? '#005538';
  const second = palette[1]?.hex ?? '#ffffff';
  return {
    color: value?.kind === 'color' ? value.color : first,
    gradient:
      value?.kind === 'gradient' ? value : { kind: 'gradient', stops: [first, second], angle: 180 },
  };
}
