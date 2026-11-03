import { balancedWrap } from '@ggraphic/editor/text';

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
  const fits = (lines: string[], size: number) => linesFit(lines, size, inner, measureLine);
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

/** Every line, a box `size` high centred on its offset, lies inside a circle of radius `inner`. */
function linesFit(
  lines: readonly string[],
  size: number,
  inner: number,
  measureLine: (line: string, size: number) => number
): boolean {
  return lines.every((line, i) => {
    const edge = Math.abs((i - (lines.length - 1) / 2) * size * STOERER_LINE_STEP) + size / 2;
    return (measureLine(line, size) / 2) ** 2 + edge ** 2 <= inner ** 2;
  });
}

/**
 * Fixed lines (a date circle's weekday, date, time) as a Störer sets them: the
 * largest size at which they fit inside 90 % of the circle.
 */
export function fitStoererLines(
  lines: readonly string[],
  radius: number,
  measureLine: (line: string, size: number) => number,
  maxSize: number,
  minSize = 20
): number | null {
  const inner = radius * STOERER_TEXT_SHARE;
  for (let size = maxSize; size >= minSize; size--) {
    if (linesFit(lines, size, inner, measureLine)) return size;
  }
  return null;
}
