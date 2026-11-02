import { balancedWrap } from '@ggraphic/editor/composer/textFit';

/** Distance between Störer lines, as a share of the font size. */
export const STOERER_LINE_STEP = 1.1;
/** The DE design guide keeps 10 % of the Störer free around its text. */
const STOERER_TEXT_SHARE = 0.9;
/** Largest Störer type as a share of the radius (88 px at 125). */
export const STOERER_MAX_SIZE_SHARE = 0.7;
/** Smallest Störer type that still reads at feed size (on 1080 px). */
export const STOERER_MIN_READABLE = 32;
/** DE Störer sizes, largest first; the largest holds any 28-character text. */
export const STOERER_RADII = [175, 165, 155, 145, 135, 125, 115, 105, 95];

/**
 * DE Störer text: the largest size at which some wrap of the text fits,
 * corner to corner, inside 90 % of the circle. Each line counts as a box
 * `size` high, centred on its offset — taller than the glyphs, so the margin
 * only grows.
 */
export function fitStoererText(
  text: string,
  radius: number,
  measureLine: (line: string, size: number) => number,
  maxSize: number,
  minSize = 20
): { lines: string[]; size: number } | null {
  const inner = radius * STOERER_TEXT_SHARE;
  const fits = (lines: string[], size: number) =>
    lines.every((line, i) => {
      const edge = Math.abs((i - (lines.length - 1) / 2) * size * STOERER_LINE_STEP) + size / 2;
      return (measureLine(line, size) / 2) ** 2 + edge ** 2 <= inner ** 2;
    });
  for (let size = maxSize; size >= minSize; size--) {
    const measureAt = (l: string) => measureLine(l, size);
    // Narrower wraps trade width for lines; the circle has room for either.
    for (let width = 2 * inner; width >= size; width -= 10) {
      const lines = balancedWrap(text, width, measureAt);
      if (fits(lines, size)) return { lines, size };
    }
  }
  return null;
}
