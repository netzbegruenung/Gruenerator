/**
 * Hand-drawn marks — the loose ellipse round a word, the brush underline, the
 * swoosh arrow and the burst strokes of the AT posts (Dc_L5vriG5z, DciacLNDopH,
 * Dc3A9PNiH6l). Each is a filled brush outline built in canvas px from the
 * shape's own width and height, centred on 0,0: the stroke keeps its width when
 * the shape is stretched to fit a word, which a scaled 100×100 path would not.
 */

export const HAND_SHAPE_TYPES = [
  'hand-kreis',
  'hand-unterstrich',
  'hand-pfeil',
  'hand-ausruf',
] as const;
export type HandShapeType = (typeof HAND_SHAPE_TYPES)[number];

export const isHandShape = (type: string): type is HandShapeType =>
  (HAND_SHAPE_TYPES as readonly string[]).includes(type);

type Point = [number, number];

const smooth = (t: number) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};
const num = (v: number) => (Math.round(v * 10) / 10).toString();

/** The outline of a brush stroke along `points`, `width(t)` across at t ∈ [0, 1]. */
function brush(points: Point[], width: (t: number) => number): string {
  const n = points.length;
  const left: Point[] = [];
  const right: Point[] = [];
  points.forEach(([x, y], i) => {
    const [px, py] = points[Math.max(0, i - 1)]!;
    const [nx, ny] = points[Math.min(n - 1, i + 1)]!;
    const len = Math.hypot(nx - px, ny - py) || 1;
    const half = width(i / (n - 1)) / 2;
    const ox = (-(ny - py) / len) * half;
    const oy = ((nx - px) / len) * half;
    left.push([x + ox, y + oy]);
    right.push([x - ox, y - oy]);
  });
  const outline = [...left, ...right.reverse()];
  return `M${outline.map(([x, y]) => `${num(x)},${num(y)}`).join('L')}Z`;
}

const sample = (count: number, at: (t: number) => Point): Point[] =>
  Array.from({ length: count + 1 }, (_, i) => at(i / count));

/** Thin where the pen lands and lifts, full in between. */
const taper = (sw: number, start: number, end: number, lift: number) => (t: number) =>
  sw * (start + (1 - start) * smooth(t / 0.12)) * (1 - (1 - lift) * smooth((t - end) / (1 - end)));

/**
 * One loop and a bit round the box: it lands left of the word, runs under it,
 * and its end overshoots the start above it, a little wider — never closed.
 */
function kreis(w: number, h: number, sw: number): string {
  // The spiral drifts outward by up to `room`: start inside, end wider than the start.
  const room = h * 0.08;
  const a = Math.max(1, w / 2 - sw / 2 - room);
  const b = Math.max(1, h / 2 - sw / 2 - room);
  const start = Math.PI * 1.1;
  const sweep = Math.PI * 2 + 0.55;
  const tilt = (-2.5 * Math.PI) / 180;
  const points = sample(120, (t) => {
    const theta = start - sweep * t;
    const drift =
      room *
      (-0.6 + 0.9 * t + 0.25 * Math.sin(t * Math.PI * 4 + 0.6) + 0.7 * smooth((t - 0.85) / 0.15));
    // Lopsided like a quick hand: a fuller right end, a flatter top.
    const x = (a + drift) * Math.cos(theta) * (1 - 0.03 * Math.sin(2 * theta));
    const y = (b + drift) * Math.sin(theta) * (1 + 0.08 * Math.cos(theta) - 0.05 * Math.sin(theta));
    return [x * Math.cos(tilt) - y * Math.sin(tilt), x * Math.sin(tilt) + y * Math.cos(tilt)];
  });
  // The wobble and the tilt reach past the ellipse: pull the loop back into its box.
  const fit = (axis: 0 | 1, half: number) =>
    Math.min(1, (half - sw / 2) / Math.max(1, ...points.map((p) => Math.abs(p[axis]))));
  const fx = fit(0, w / 2);
  const fy = fit(1, h / 2);
  return brush(
    points.map(([x, y]) => [x * fx, y * fy]),
    taper(sw, 0.45, 0.82, 0.25)
  );
}

/** A single stroke under the word, rising slightly to the right, heavy start, light end. */
function unterstrich(w: number, h: number, sw: number): string {
  const half = Math.max(1, w / 2 - sw / 2);
  const amp = Math.max(0, h - sw) / 2;
  const points = sample(60, (t) => [
    -half + 2 * half * t,
    amp *
      (0.45 * (1 - 2 * t) -
        0.25 * Math.sin(Math.PI * t) +
        0.05 * Math.sin(t * 11) -
        0.35 * smooth((t - 0.9) / 0.1)),
  ]);
  // A marker's ink runs unevenly: the width breathes a little along the stroke.
  const width = taper(sw, 0.75, 0.72, 0.3);
  return brush(points, (t) => width(t) * (1 + 0.1 * Math.sin(t * 19 + 1) * Math.sin(t * 7)));
}

/** A swoosh from the lower left, curving up to the right, with an open head of two strokes. */
function pfeil(w: number, h: number, sw: number): string {
  const head = Math.min(w, h) * 0.42;
  const tip: Point = [w / 2 - sw / 2, -h / 2 + head * 0.55 + sw / 2];
  const tail: Point = [-w / 2 + sw / 2, h / 2 - sw / 2];
  const c1: Point = [-w * 0.18, -h * 0.05];
  const c2: Point = [w * 0.15, tip[1] - h * 0.02];
  const bezier = (t: number): Point => {
    const u = 1 - t;
    return [
      u * u * u * tail[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * tip[0],
      u * u * u * tail[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * tip[1],
    ];
  };
  const shaft = brush(sample(60, bezier), (t) => sw * (0.25 + 0.75 * smooth(t / 0.6)));
  const [bx, by] = bezier(0.97);
  const dir = Math.atan2(tip[1] - by, tip[0] - bx);
  const barb = (angle: number, length: number) => {
    const back = dir + Math.PI + angle;
    const end: Point = [tip[0] + Math.cos(back) * length, tip[1] + Math.sin(back) * length];
    return brush(
      sample(12, (t) => [end[0] + (tip[0] - end[0]) * t, end[1] + (tip[1] - end[1]) * t]),
      (t) => sw * (0.35 + 0.65 * smooth(t / 0.8))
    );
  };
  return `${shaft}${barb(-0.62, head)}${barb(0.55, head * 0.9)}`;
}

/** Three short strokes bursting up and right from the lower left corner. */
function ausruf(w: number, h: number, sw: number): string {
  const origin: Point = [-w / 2 + sw / 2, h / 2 - sw / 2];
  const rx = w - sw;
  const ry = h - sw;
  return [
    { angle: -1.45, from: 0.42, to: 0.92 },
    { angle: -0.82, from: 0.4, to: 1 },
    { angle: -0.2, from: 0.42, to: 0.9 },
  ]
    .map(({ angle, from, to }) => {
      const at = (r: number): Point => [
        origin[0] + Math.cos(angle) * rx * r,
        origin[1] + Math.sin(angle) * ry * r,
      ];
      return brush(
        sample(10, (t) => at(from + (to - from) * t)),
        (t) => sw * (1 - 0.6 * smooth((t - 0.3) / 0.7))
      );
    })
    .join('');
}

/** The filled outline of a hand-drawn shape, `width` × `height` px, centred on 0,0. */
export function handDrawnPath(
  type: HandShapeType,
  width: number,
  height: number,
  strokeWidth: number
): string {
  switch (type) {
    case 'hand-kreis':
      return kreis(width, height, strokeWidth);
    case 'hand-unterstrich':
      return unterstrich(width, height, strokeWidth);
    case 'hand-pfeil':
      return pfeil(width, height, strokeWidth);
    case 'hand-ausruf':
      return ausruf(width, height, strokeWidth);
  }
}
