/** Text-badge geometry in design units; rendered as SVG path data by react-konva. */

export const BADGE_SHAPES = [
  { id: 'stoerer', label: 'Störer' },
  { id: 'kreis', label: 'Kreis' },
  { id: 'kapsel', label: 'Kapsel' },
  { id: 'banner', label: 'Banner' },
  { id: 'sprechblase', label: 'Sprechblase' },
] as const;
export type BadgeShapeId = (typeof BADGE_SHAPES)[number]['id'];

export const BADGE_MAX_LINES = 3;

export interface Point {
  x: number;
  y: number;
}

export interface BadgeGeometry {
  width: number;
  height: number;
  path: string;
  /** Where the text is set, centred. */
  textBox: { x: number; y: number; width: number; height: number };
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function polygonPath(points: Point[]): string {
  return `${points.map((p, i) => `${i === 0 ? 'M' : 'L'}${r1(p.x)} ${r1(p.y)}`).join(' ')} Z`;
}

/** Alternating outer and inner vertices, first spike pointing straight up. */
export function starburstPoints(
  center: Point,
  spikes: number,
  outer: number,
  inner: number
): Point[] {
  return Array.from({ length: spikes * 2 }, (_, i) => {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = (i / (spikes * 2)) * 2 * Math.PI - Math.PI / 2;
    return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
  });
}

function roundedRectPath(w: number, h: number, r: number, tail: Point[] = []): string {
  // Clockwise from the top-left corner; an optional tail is inserted in the bottom edge.
  const bottom = tail.map((p) => `L${p.x} ${p.y}`).join(' ');
  return [
    `M${r} 0 H${w - r} A${r} ${r} 0 0 1 ${w} ${r}`,
    `V${h - r} A${r} ${r} 0 0 1 ${w - r} ${h}`,
    `${bottom} H${r} A${r} ${r} 0 0 1 0 ${h - r}`,
    `V${r} A${r} ${r} 0 0 1 ${r} 0 Z`,
  ]
    .join(' ')
    .replace(/\s+/g, ' ');
}

export function badgeGeometry(shape: BadgeShapeId): BadgeGeometry {
  switch (shape) {
    case 'stoerer': {
      const size = 880;
      const inner = 380;
      return {
        width: size,
        height: size,
        path: polygonPath(starburstPoints({ x: size / 2, y: size / 2 }, 20, size / 2, inner)),
        textBox: { x: size / 2 - 270, y: size / 2 - 200, width: 540, height: 400 },
      };
    }
    case 'kreis': {
      const size = 800;
      const r = size / 2;
      return {
        width: size,
        height: size,
        path: `M0 ${r} A${r} ${r} 0 1 0 ${size} ${r} A${r} ${r} 0 1 0 0 ${r} Z`,
        textBox: { x: r - 290, y: r - 220, width: 580, height: 440 },
      };
    }
    case 'kapsel': {
      const w = 1000;
      const h = 400;
      return {
        width: w,
        height: h,
        path: roundedRectPath(w, h, h / 2),
        textBox: { x: 140, y: 60, width: w - 280, height: h - 120 },
      };
    }
    case 'banner': {
      const w = 1040;
      const h = 360;
      const notch = 80;
      return {
        width: w,
        height: h,
        path: polygonPath([
          { x: 0, y: 0 },
          { x: w, y: 0 },
          { x: w - notch, y: h / 2 },
          { x: w, y: h },
          { x: 0, y: h },
          { x: notch, y: h / 2 },
        ]),
        textBox: { x: notch + 50, y: 50, width: w - 2 * (notch + 50), height: h - 100 },
      };
    }
    case 'sprechblase': {
      const w = 900;
      const body = 600;
      return {
        width: w,
        height: 780,
        path: roundedRectPath(w, body, 90, [
          { x: 380, y: body },
          { x: 170, y: 780 },
          { x: 210, y: body },
        ]),
        textBox: { x: 90, y: 70, width: w - 180, height: body - 140 },
      };
    }
  }
}

/** Up to {@link BADGE_MAX_LINES} non-empty lines. */
export function badgeLines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, BADGE_MAX_LINES);
}

/**
 * The largest font size at which every line fits the box. `measure` returns a
 * line's width at font size 100; text width scales linearly with the size.
 */
export function fitFontSize(
  lines: string[],
  box: { width: number; height: number },
  measure: (line: string) => number,
  lineHeight: number,
  maxSize = 260
): number {
  if (lines.length === 0) return maxSize;
  const widest = Math.max(...lines.map(measure), 1);
  const byWidth = (box.width / widest) * 100;
  const byHeight = box.height / (lines.length * lineHeight);
  return Math.max(1, Math.floor(Math.min(maxSize, byWidth, byHeight)));
}
