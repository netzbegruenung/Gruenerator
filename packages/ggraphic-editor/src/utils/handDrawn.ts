// SPDX-License-Identifier: MPL-2.0
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
  'hand-marker',
  'hand-marker-box',
  'hand-winken',
  'hand-pfeil-schlaufe',
  'hand-pfeil-welle',
  'hand-pfeil-bogen',
  'hand-pfeil-haken',
  'hand-pfeil-herz',
  'hand-pfeil-spirale',
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

const outline = (points: Point[]) => `M${points.map(([x, y]) => `${num(x)},${num(y)}`).join('L')}Z`;

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
  return outline([...left, ...right.reverse()]);
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

/** A smooth line through `knots` (centripetal Catmull-Rom: no cusps or overshoot at tight turns). */
function spline(knots: Point[], perSegment: number): Point[] {
  const n = knots.length;
  const at = (i: number): Point => {
    if (i < 0) return [2 * knots[0]![0] - knots[1]![0], 2 * knots[0]![1] - knots[1]![1]];
    if (i >= n) {
      const [ax, ay] = knots[n - 1]!;
      const [bx, by] = knots[n - 2]!;
      return [2 * ax - bx, 2 * ay - by];
    }
    return knots[i]!;
  };
  const out: Point[] = [knots[0]!];
  for (let i = 0; i < n - 1; i++) {
    const p = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const k = [0];
    for (let j = 1; j < 4; j++) {
      const [ax, ay] = p[j - 1]!;
      const [bx, by] = p[j]!;
      k.push(k[j - 1]! + Math.max(1e-6, Math.sqrt(Math.hypot(bx - ax, by - ay))));
    }
    const lerp = (a: Point, b: Point, ta: number, tb: number, t: number): Point => {
      const u = (t - ta) / (tb - ta);
      return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
    };
    for (let s = 1; s <= perSegment; s++) {
      const t = k[1]! + ((k[2]! - k[1]!) * s) / perSegment;
      const a1 = lerp(p[0]!, p[1]!, k[0]!, k[1]!, t);
      const a2 = lerp(p[1]!, p[2]!, k[1]!, k[2]!, t);
      const a3 = lerp(p[2]!, p[3]!, k[2]!, k[3]!, t);
      const b1 = lerp(a1, a2, k[0]!, k[2]!, t);
      const b2 = lerp(a2, a3, k[1]!, k[3]!, t);
      out.push(lerp(b1, b2, k[1]!, k[2]!, t));
    }
  }
  return out;
}

/** A heart from its point round both lobes back to the point, `size` 1 ≈ 32 wide. */
const heartKnots = (x: number, y: number, size: number): Point[] =>
  Array.from({ length: 17 }, (_, i) => {
    const t = Math.PI + (2 * Math.PI * i) / 16;
    return [
      x + size * 16 * Math.sin(t) ** 3,
      y -
        size *
          (17 + 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)),
    ];
  });

/**
 * The arrows of the introduction posts, each a pen line from a tail to an
 * open head, traced in a frame where the tail sits at 0,0 and the tip at
 * 100,0 (y down). `pen` is the line's share of the stroke width — the curly
 * ones are drawn with a fine pen, the plain ones with a marker — `head` the
 * barb's length in pen widths, `lead` how thin the pen lands.
 */
const ARROW_DESIGNS = {
  // A plain arc, sagging under its chord: "Rheinländerin", "Bouldert".
  'hand-pfeil-bogen': {
    pen: 1,
    head: 4.4,
    lead: 0.35,
    knots: [
      [0, 0],
      [14, 9],
      [32, 14],
      [52, 15],
      [72, 11],
      [88, 5],
      [100, 0],
    ],
  },
  // Leaves the label sideways, bends round and runs in: "Gamerin", "Halbtürkin".
  'hand-pfeil-haken': {
    pen: 1,
    head: 4.4,
    lead: 0.3,
    knots: [
      [0, 0],
      [1, 9],
      [6, 18],
      [16, 24],
      [32, 25],
      [52, 20],
      [72, 12],
      [88, 5],
      [100, 0],
    ],
  },
  // One soft swing: an S lying on its side.
  'hand-pfeil-welle': {
    pen: 0.75,
    head: 5.5,
    lead: 0.5,
    knots: [
      [0, 0],
      [12, -6],
      [26, -8],
      [42, -3],
      [58, 4],
      [74, 7],
      [88, 4],
      [100, 0],
    ],
  },
  // One loop above the line, then a long run in: "Tierschützerin", "Jess".
  'hand-pfeil-schlaufe': {
    pen: 0.75,
    head: 5.5,
    lead: 0.5,
    knots: [
      [0, 0],
      [10, 3],
      [22, 4],
      [31, 1],
      [35, -6],
      [32, -13],
      [25, -14],
      [21, -8],
      [24, -1],
      [32, 4],
      [46, 6],
      [64, 5],
      [82, 3],
      [100, 0],
    ],
  },
  // A hook, a small curl and a heart, then a long run in: "Musikliebhaberin".
  'hand-pfeil-herz': {
    pen: 0.75,
    head: 5.5,
    lead: 0.5,
    knots: [
      [0, -14],
      [1, -7],
      [5, -2],
      [10, 0],
      [14, -3],
      [13, -7],
      [10, -6],
      [11, -2],
      [17, 1],
      [26, 2],
      ...heartKnots(36, 3, 0.62),
      [46, 6],
      [60, 7],
      [78, 4],
      [100, 0],
    ],
  },
  // A hook and two quick curls, then an S into the target: "Handwerklich …".
  'hand-pfeil-spirale': {
    pen: 0.75,
    head: 5.5,
    lead: 0.5,
    knots: [
      [0, -8],
      [3, -2],
      [8, 1],
      [15, 1],
      [20, -4],
      [18, -10],
      [13, -9],
      [13, -2],
      [20, 3],
      [28, 2],
      [33, -3],
      [31, -9],
      [26, -8],
      [26, -1],
      [33, 4],
      [45, 6],
      [58, 4],
      [72, -1],
      [86, -1],
      [100, 0],
    ],
  },
} satisfies Record<string, { pen: number; head: number; lead: number; knots: Point[] }>;
type DesignedArrow = keyof typeof ARROW_DESIGNS;

const KNOT_LINES = Object.fromEntries(
  Object.entries(ARROW_DESIGNS).map(([type, d]) => [type, spline(d.knots, 10)])
) as Record<DesignedArrow, Point[]>;

const extent = (points: Point[]) => {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
};

/** Where the line ends and which way it runs there, judged over the last `back` px. */
function tipDirection(points: Point[], back: number): number {
  const tip = points[points.length - 1]!;
  for (let i = points.length - 2; i >= 0; i--) {
    const [x, y] = points[i]!;
    if (Math.hypot(tip[0] - x, tip[1] - y) >= back || i === 0)
      return Math.atan2(tip[1] - y, tip[0] - x);
  }
  return 0;
}

/** The two barbs, opened ±0.65 rad off the line, the lower a little shorter. */
const barbEnds = (tip: Point, dir: number, length: number): Point[] =>
  [
    [-0.66, length],
    [0.62, length * 0.88],
  ].map(([angle, len]) => [
    tip[0] + Math.cos(dir + Math.PI + angle!) * len!,
    tip[1] + Math.sin(dir + Math.PI + angle!) * len!,
  ]);

/**
 * A designed arrow laid into `w` × `h`: its line, pen width and head. The
 * head's barbs keep their length in px, so the line is fitted twice — once
 * alone, once with the barbs' overhang — and the whole sits inside the box.
 */
function arrowGeometry(type: DesignedArrow, w: number, h: number, sw: number) {
  const design = ARROW_DESIGNS[type];
  const unit = KNOT_LINES[type];
  const pen = sw * design.pen;
  const box = extent(unit);
  const bw = Math.max(1e-6, box.x1 - box.x0);
  const bh = Math.max(1e-6, box.y1 - box.y0);
  const lay = (sx: number, sy: number, ox: number, oy: number): Point[] =>
    unit.map(([x, y]) => [ox + (x - box.x0) * sx, oy + (y - box.y0) * sy]);
  let sx = Math.max(1e-3, (w - pen) / bw);
  let sy = Math.max(1e-3, (h - pen) / bh);
  let points = lay(sx, sy, 0, 0);
  const tail = points[0]!;
  const tip = points[points.length - 1]!;
  const head = Math.min(pen * design.head, 0.3 * Math.hypot(tip[0] - tail[0], tip[1] - tail[1]));
  const over = extent([...points, ...barbEnds(tip, tipDirection(points, head * 0.6), head)]);
  sx = Math.max(sx * 0.2, (w - pen - (over.x1 - over.x0 - bw * sx)) / bw);
  sy = Math.max(sy * 0.2, (h - pen - (over.y1 - over.y0 - bh * sy)) / bh);
  points = lay(sx, sy, 0, 0);
  const end = points[points.length - 1]!;
  const dir = tipDirection(points, head * 0.6);
  const all = extent([...points, ...barbEnds(end, dir, head)]);
  const ox = -(all.x0 + all.x1) / 2;
  const oy = -(all.y0 + all.y1) / 2;
  points = points.map(([x, y]) => [x + ox, y + oy]);
  return { points, pen, head, dir, lead: design.lead };
}

function designedArrow(type: DesignedArrow, w: number, h: number, sw: number): string {
  const { points, pen, head, dir, lead } = arrowGeometry(type, w, h, sw);
  const tip = points[points.length - 1]!;
  const line = brush(points, (t) => pen * (lead + (1 - lead) * smooth(t / 0.25)));
  const barbs = barbEnds(tip, dir, head).map((end) =>
    brush(
      sample(12, (t) => [end[0] + (tip[0] - end[0]) * t, end[1] + (tip[1] - end[1]) * t]),
      (t) => pen * (0.45 + 0.55 * smooth(t / 0.6))
    )
  );
  return `${line}${barbs.join('')}`;
}

/** The hand-drawn arrows: one stroke from a tail to an open head. */
export const HAND_ARROW_TYPES = [
  'hand-pfeil',
  'hand-pfeil-bogen',
  'hand-pfeil-haken',
  'hand-pfeil-welle',
  'hand-pfeil-schlaufe',
  'hand-pfeil-herz',
  'hand-pfeil-spirale',
] as const;
export type HandArrowType = (typeof HAND_ARROW_TYPES)[number];
/** Height as a share of the width each arrow is drawn at by default. */
export const HAND_ARROW_ASPECT = {
  'hand-pfeil': 0.5,
  // The traced line's own proportions, plus a little for the head.
  ...Object.fromEntries(
    Object.entries(KNOT_LINES).map(([type, line]) => {
      const box = extent(line);
      return [type, (box.y1 - box.y0) / (box.x1 - box.x0) + 0.06];
    })
  ),
} as Record<HandArrowType, number>;

/** Where an arrow's stroke starts and its head points, in the shape's own frame (centred on 0,0). */
export function handArrowEnds(
  type: HandArrowType,
  w: number,
  h: number,
  sw: number
): { tail: { x: number; y: number }; tip: { x: number; y: number } } {
  if (type === 'hand-pfeil') {
    const head = Math.min(w, h) * 0.42;
    return {
      tail: { x: -w / 2 + sw / 2, y: h / 2 - sw / 2 },
      tip: { x: w / 2 - sw / 2, y: -h / 2 + head * 0.55 + sw / 2 },
    };
  }
  const { points } = arrowGeometry(type, w, h, sw);
  const [tx, ty] = points[0]!;
  const [px, py] = points[points.length - 1]!;
  return { tail: { x: tx, y: ty }, tip: { x: px, y: py } };
}

export type DesignedArrowType = DesignedArrow;

/**
 * The centre line of a designed arrow and its two barbs (each from its free
 * end to the tip), in the shape's own frame — what the stroke covers, for
 * keeping it clear of text.
 */
export function handArrowStroke(
  type: DesignedArrowType,
  w: number,
  h: number,
  sw: number
): { line: { x: number; y: number }[]; barbs: { x: number; y: number }[][]; pen: number } {
  const { points, pen, head, dir } = arrowGeometry(type, w, h, sw);
  const tip = points[points.length - 1]!;
  return {
    line: points.map(([x, y]) => ({ x, y })),
    barbs: barbEnds(tip, dir, head).map((end) =>
      sample(4, (t) => [end[0] + (tip[0] - end[0]) * t, end[1] + (tip[1] - end[1]) * t]).map(
        ([x, y]) => ({ x, y })
      )
    ),
    pen,
  };
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

/**
 * A highlighter swipe: a band the full height of the shape, its ends cut at
 * the slant of a chisel tip and frayed where the ink ran thin, the edges
 * wavering slightly along the stroke.
 */
function marker(w: number, h: number): string {
  const half = w / 2;
  const slant = Math.min(h * 0.3, w * 0.08);
  const steps = 40;
  // Deterministic waver: the same shape draws the same edge on every render.
  const edge = (t: number, phase: number) =>
    h * (0.025 * Math.sin(t * 13 + phase) + 0.015 * Math.sin(t * 31 + phase * 2));
  // A parallelogram: the top edge set right by the chisel's slant, the bottom left.
  const run = w - 2 * slant;
  const top = sample(steps, (t): Point => [
    -half + 2 * slant + run * t,
    -h / 2 + Math.abs(edge(t, 0.4)),
  ]);
  const bottom = sample(steps, (t): Point => [
    half - 2 * slant - run * t,
    h / 2 - Math.abs(edge(t, 1.7)),
  ]);
  // The cut ends, frayed where the ink ran thin: one point dips in, two bulge out.
  const fray = (from: Point, to: Point, sign: 1 | -1): Point[] =>
    [0.3, 0.55, 0.8].map((t, i) => [
      from[0] + (to[0] - from[0]) * t + sign * slant * (i === 1 ? -0.35 : 0.12),
      from[1] + (to[1] - from[1]) * t,
    ]);
  return outline([
    ...top,
    ...fray(top[steps]!, bottom[0]!, 1),
    ...bottom,
    ...fray(bottom[steps]!, top[0]!, -1),
  ]);
}

/**
 * The marker box behind a passage, as the DE posts set it — a straight box
 * whose edges are just short of ruler-straight, so it reads as laid by hand.
 */
function markerBox(w: number, h: number): string {
  const wobble = (t: number, phase: number) => Math.min(h, w) * 0.012 * Math.sin(t * 9 + phase);
  const top = sample(24, (t): Point => [-w / 2 + w * t, -h / 2 + Math.abs(wobble(t, 0.3))]);
  const bottom = sample(24, (t): Point => [w / 2 - w * t, h / 2 - Math.abs(wobble(t, 2.1))]);
  return outline([...top, ...bottom]);
}

/**
 * A waving hand in a few brush strokes: the palm's outline, four fingers and
 * the thumb, two motion arcs at the upper right — the doodle beside a name.
 */
function winken(w: number, h: number, sw: number): string {
  const s = Math.min(w, h);
  const line = (from: Point, to: Point, lift = 0.5) =>
    brush(
      sample(10, (t) => [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]),
      (t) => sw * (1 - lift * smooth((t - 0.6) / 0.4))
    );
  const arc = (cx: number, cy: number, r: number, from: number, to: number) =>
    brush(
      sample(16, (t) => {
        const a = from + (to - from) * t;
        return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
      }),
      (t) => sw * (0.5 + 0.5 * Math.sin(Math.PI * t))
    );
  // Palm: a rounded cup open at the top, tilted like a hand mid-wave.
  const palm = brush(
    sample(30, (t) => {
      const a = Math.PI * (0.15 + 0.85 * t);
      return [-s * 0.08 + Math.cos(a) * s * 0.2, s * 0.12 + Math.sin(a) * s * 0.26];
    }),
    taper(sw, 0.6, 0.85, 0.5)
  );
  const fingers = [
    { base: [-s * 0.22, s * 0.02], tip: [-s * 0.3, -s * 0.3] },
    { base: [-s * 0.12, -s * 0.02], tip: [-s * 0.14, -s * 0.42] },
    { base: [-s * 0.02, 0], tip: [s * 0.02, -s * 0.38] },
    { base: [s * 0.08, s * 0.04], tip: [s * 0.16, -s * 0.26] },
  ].map(({ base, tip }) => line(base as Point, tip as Point));
  const thumb = line([s * 0.12, s * 0.2], [s * 0.3, s * 0.02]);
  return [
    palm,
    ...fingers,
    thumb,
    arc(s * 0.18, -s * 0.18, s * 0.2, -1.2, -0.2),
    arc(s * 0.18, -s * 0.18, s * 0.3, -1.25, -0.25),
  ].join('');
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
    case 'hand-marker':
      return marker(width, height);
    case 'hand-marker-box':
      return markerBox(width, height);
    case 'hand-winken':
      return winken(width, height, strokeWidth);
    case 'hand-pfeil-schlaufe':
    case 'hand-pfeil-welle':
    case 'hand-pfeil-bogen':
    case 'hand-pfeil-haken':
    case 'hand-pfeil-herz':
    case 'hand-pfeil-spirale':
      return designedArrow(type, width, height, strokeWidth);
  }
}
