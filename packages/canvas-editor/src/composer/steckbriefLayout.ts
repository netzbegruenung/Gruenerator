/**
 * Geometry of the `steckbrief` item: a person in the middle, short traits
 * around them, each with a hand-drawn arrow to the person. Pure and
 * deterministic — the composer measures the text, this places it.
 */
import {
  HAND_ARROW_ASPECT,
  handArrowEnds,
  handArrowStroke,
  type DesignedArrowType,
  type HandArrowType,
} from '../utils/handDrawn';

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

type Point = { x: number; y: number };

/** The portrait's height as a share of the slide's. */
const STECKBRIEF_PERSON_HEIGHT = 0.74;

/**
 * Where the person stands, as the 2:3 portrait frame they were shot in: a
 * cut-out (or a photo kept to the portrait's frame) centred on the bottom
 * edge, the traits around it; a background photo cover-fitted to the slide.
 */
export function steckbriefPerson(
  canvas: { width: number; height: number },
  fullBleed = false
): Box {
  if (fullBleed) {
    // The photo cover-fitted to the slide, centred, as the background draws it.
    const width = Math.max(canvas.width, (canvas.height * 2) / 3);
    const height = width * 1.5;
    return { x: (canvas.width - width) / 2, y: (canvas.height - height) / 2, width, height };
  }
  const height = canvas.height * STECKBRIEF_PERSON_HEIGHT;
  const width = Math.min(canvas.width * 0.66, (height * 2) / 3);
  // A touch left of centre: the greeting stands beside the face on the right.
  const x = (canvas.width - width) / 2 - canvas.width * 0.04;
  return { x, y: canvas.height - height, width, height };
}

/**
 * The outline of a head-and-shoulders portrait in its 2:3 frame (shares),
 * clockwise from the left temple — measured on the Vorlage's cut-out: hair,
 * cheeks, neck, shoulders out to the frame's edges.
 */
const OUTLINE: readonly [number, number][] = [
  [0.25, 0.18],
  [0.3, 0.145],
  [0.36, 0.11],
  [0.42, 0.097],
  [0.5, 0.098],
  [0.56, 0.108],
  [0.62, 0.12],
  [0.67, 0.145],
  [0.71, 0.17],
  [0.74, 0.2],
  [0.75, 0.235],
  [0.72, 0.27],
  [0.71, 0.32],
  [0.72, 0.36],
  [0.7, 0.4],
  [0.68, 0.44],
  [0.66, 0.48],
  [0.65, 0.52],
  [0.65, 0.55],
  [0.71, 0.57],
  [0.82, 0.595],
  [0.9, 0.62],
  [0.965, 0.645],
  [0.995, 0.68],
  [1, 0.72],
  [1, 1],
  [0, 1],
  [0, 0.72],
  [0.01, 0.69],
  [0.03, 0.67],
  [0.065, 0.645],
  [0.12, 0.62],
  [0.21, 0.595],
  [0.29, 0.57],
  [0.345, 0.545],
  [0.33, 0.495],
  [0.31, 0.47],
  [0.29, 0.43],
  [0.27, 0.4],
  [0.26, 0.36],
  [0.27, 0.32],
  [0.26, 0.27],
  [0.215, 0.245],
  [0.225, 0.215],
];
/** Eyes, nose and mouth, shares of the frame: no arrow crosses them. */
const FACE = { x0: 0.28, x1: 0.7, y0: 0.25, y1: 0.56 } as const;

const inFrame = (person: Box, [x, y]: readonly [number, number]): Point => ({
  x: person.x + person.width * x,
  y: person.y + person.height * y,
});

/** The face keep-out in canvas px. */
export function steckbriefFace(person: Box): Box {
  const a = inFrame(person, [FACE.x0, FACE.y0]);
  const b = inFrame(person, [FACE.x1, FACE.y1]);
  return { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y };
}

/**
 * One place for a trait, after the layout of the introduction posts: which
 * side it hugs and its top as a share of the height (on a cut-out and on a
 * photo, whose head leaves other gaps), the point on the person its arrow would rather end at (shares of
 * the frame) and the arrow's stroke. Listed in the order they fill, so a few
 * traits still spread round the person.
 */
export interface SteckbriefSlot {
  side: 'links' | 'rechts';
  top: number;
  /** Where the arrow ends, just off the silhouette (shares of the frame). */
  target: Point;
  arrow: DesignedArrowType;
  /** Where its tail starts: beside the inner edge, under the last line, over the first. */
  anchor: 'innen' | 'unten' | 'oben';
  /** Which way the stroke bows (see `arrowPose`). */
  bow: 1 | -1;
  /** On a background photo the person is larger: where the arrow ends and starts there. */
  fotoTarget: Point;
  fotoAnchor: 'innen' | 'unten' | 'oben';
}

export const STECKBRIEF_SLOTS: readonly SteckbriefSlot[] = [
  {
    side: 'links',
    top: 0.05,
    target: { x: 0.33, y: 0.115 },
    arrow: 'hand-pfeil-spirale',
    anchor: 'unten',
    bow: 1,
    fotoTarget: { x: 0.25, y: 0.36 },
    fotoAnchor: 'unten',
  },
  {
    side: 'rechts',
    top: 0.07,
    target: { x: 0.62, y: 0.095 },
    arrow: 'hand-pfeil-herz',
    anchor: 'unten',
    bow: -1,
    fotoTarget: { x: 0.745, y: 0.26 },
    fotoAnchor: 'unten',
  },
  {
    side: 'links',
    top: 0.36,
    target: { x: 0.31, y: 0.5 },
    arrow: 'hand-pfeil-haken',
    anchor: 'unten',
    bow: 1,
    fotoTarget: { x: 0.36, y: 0.6 },
    fotoAnchor: 'unten',
  },
  {
    side: 'rechts',
    top: 0.25,
    target: { x: 0.78, y: 0.215 },
    arrow: 'hand-pfeil-bogen',
    anchor: 'unten',
    bow: -1,
    fotoTarget: { x: 0.73, y: 0.36 },
    fotoAnchor: 'unten',
  },
  {
    side: 'links',
    top: 0.7,
    target: { x: 0.3, y: 0.52 },
    arrow: 'hand-pfeil-bogen',
    anchor: 'oben',
    bow: -1,
    fotoTarget: { x: 0.42, y: 0.62 },
    fotoAnchor: 'oben',
  },
  {
    side: 'rechts',
    top: 0.64,
    target: { x: 0.74, y: 0.565 },
    arrow: 'hand-pfeil-bogen',
    anchor: 'innen',
    bow: 1,
    fotoTarget: { x: 0.78, y: 0.64 },
    fotoAnchor: 'oben',
  },
  {
    side: 'links',
    top: 0.83,
    target: { x: 0.42, y: 0.62 },
    arrow: 'hand-pfeil-welle',
    anchor: 'oben',
    bow: 1,
    fotoTarget: { x: 0.4, y: 0.75 },
    fotoAnchor: 'innen',
  },
  {
    side: 'rechts',
    top: 0.8,
    target: { x: 0.64, y: 0.78 },
    arrow: 'hand-pfeil-haken',
    anchor: 'innen',
    bow: 1,
    fotoTarget: { x: 0.62, y: 0.76 },
    fotoAnchor: 'innen',
  },
  {
    side: 'links',
    top: 0.52,
    target: { x: 0.26, y: 0.4 },
    arrow: 'hand-pfeil-bogen',
    anchor: 'innen',
    bow: 1,
    fotoTarget: { x: 0.34, y: 0.58 },
    fotoAnchor: 'innen',
  },
  {
    side: 'links',
    top: 0.2,
    target: { x: 0.24, y: 0.17 },
    arrow: 'hand-pfeil-schlaufe',
    anchor: 'unten',
    bow: 1,
    fotoTarget: { x: 0.26, y: 0.27 },
    fotoAnchor: 'innen',
  },
];

/**
 * Which places a given number of traits takes, top to bottom on both sides:
 * few traits spread over the whole height instead of filling the top first.
 */
const SLOTS_FOR: Record<number, readonly number[]> = {
  3: [0, 4, 5],
  4: [0, 1, 4, 5],
  5: [0, 1, 2, 5, 6],
  6: [0, 1, 2, 4, 5, 7],
  7: [0, 1, 2, 3, 4, 5, 7],
};

/** The places of `count` traits, in trait order. */
export function steckbriefSlots(count: number): SteckbriefSlot[] {
  const picked = SLOTS_FOR[count] ?? STECKBRIEF_SLOTS.map((_, k) => k).slice(0, count);
  return picked.map((k) => STECKBRIEF_SLOTS[k]!);
}

/** Konva's transform of a centred shape: scale, then rotate (degrees), then move. */
export function shapePoint(
  pose: { x: number; y: number; rotation: number; scaleX: number; scaleY: number },
  local: Point
): Point {
  const a = (pose.rotation * Math.PI) / 180;
  const lx = local.x * pose.scaleX;
  const ly = local.y * pose.scaleY;
  return {
    x: pose.x + lx * Math.cos(a) - ly * Math.sin(a),
    y: pose.y + lx * Math.sin(a) + ly * Math.cos(a),
  };
}

/**
 * The pose of a hand-drawn arrow whose tail lands on `from` and whose tip
 * lands on `to`. The stroke is mirrored for an arrow running leftward, so it
 * bows the same way as seen from its label; `bow: -1` bends it the other way.
 */
export function arrowPose(
  type: HandArrowType,
  from: Point,
  to: Point,
  strokeWidth: number,
  bow: 1 | -1 = 1
) {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const aspect = HAND_ARROW_ASPECT[type];
  const scaleX = to.x < from.x ? -1 : 1;
  const scaleY = bow;
  // The tail-to-tip distance grows linearly with the width: two corrections land it.
  const span = (w: number) => {
    const { tail, tip } = handArrowEnds(type, w, w * aspect, strokeWidth);
    return Math.hypot(tip.x - tail.x, tip.y - tail.y);
  };
  let width = Math.max(strokeWidth * 6, length);
  width *= length / Math.max(1, span(width));
  width *= length / Math.max(1, span(width));
  const height = width * aspect;
  const { tail, tip } = handArrowEnds(type, width, height, strokeWidth);
  const local = Math.atan2(scaleY * (tip.y - tail.y), scaleX * (tip.x - tail.x));
  const rotation = ((Math.atan2(to.y - from.y, to.x - from.x) - local) * 180) / Math.PI;
  const start = shapePoint({ x: 0, y: 0, rotation, scaleX, scaleY }, tail);
  return { x: from.x - start.x, y: from.y - start.y, width, height, rotation, scaleX, scaleY };
}

type Pose = ReturnType<typeof arrowPose>;

/** Where a placed arrow's stroke runs: its line, tail first, then both barbs. */
export function arrowSamples(
  type: DesignedArrowType,
  pose: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    scaleX: number;
    scaleY: number;
  },
  strokeWidth: number
) {
  const { line, barbs } = handArrowStroke(type, pose.width, pose.height, strokeWidth);
  return {
    line: line.map((p) => shapePoint(pose, p)),
    barbs: barbs.flat().map((p) => shapePoint(pose, p)),
  };
}

/** Something an arrow keeps clear of: boxes, turned `rotation` degrees about `pivot` (Konva text). */
export interface Obstacle {
  rects: Box[];
  pivot: Point;
  rotation: number;
}

export function obstacleHit(o: Obstacle, p: Point, pad: number): boolean {
  const a = (-o.rotation * Math.PI) / 180;
  const dx = p.x - o.pivot.x;
  const dy = p.y - o.pivot.y;
  const x = o.pivot.x + dx * Math.cos(a) - dy * Math.sin(a);
  const y = o.pivot.y + dx * Math.sin(a) + dy * Math.cos(a);
  return o.rects.some(
    (r) => x > r.x - pad && x < r.x + r.width + pad && y > r.y - pad && y < r.y + r.height + pad
  );
}

/** The portrait's outline in canvas px. */
export function steckbriefOutline(person: Box): Point[] {
  return OUTLINE.map((p) => inFrame(person, p));
}

/** Where a row crosses the outline: its leftmost and rightmost x, or null above the head. */
export function outlineSpan(outline: Point[], y: number): [number, number] | null {
  const xs: number[] = [];
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const a = outline[j]!;
    const b = outline[i]!;
    if (a.y > y !== b.y > y) xs.push(a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y));
  }
  return xs.length ? [Math.min(...xs), Math.max(...xs)] : null;
}

/** Distance from the outline, negative inside it. */
export function outlineDistance(outline: Point[], p: Point): number {
  let inside = false;
  let best = Infinity;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const a = outline[j]!;
    const b = outline[i]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const t = Math.max(
      0,
      Math.min(1, ((p.x - a.x) * ex + (p.y - a.y) * ey) / (ex * ex + ey * ey || 1))
    );
    best = Math.min(best, Math.hypot(p.x - a.x - t * ex, p.y - a.y - t * ey));
  }
  return inside ? -best : best;
}

/** Points just off the outline, `gap` out, every ~`step` px, with the way in. */
function edgeTargets(outline: Point[], gap: number, step: number) {
  const out: { at: Point; inward: Point }[] = [];
  outline.forEach((a, i) => {
    const b = outline[(i + 1) % outline.length]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.round(len / step));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      // Clockwise on screen (y down): the left-hand normal points out.
      const nx = (b.y - a.y) / len;
      const ny = -(b.x - a.x) / len;
      out.push({ at: { x: p.x + nx * gap, y: p.y + ny * gap }, inward: { x: -nx, y: -ny } });
    }
  });
  return out;
}

export interface ArrowScene {
  canvas: { width: number; height: number };
  person: Box;
  /** Text and marks no arrow may cross: the other labels, the greeting, the corners. */
  obstacles: Obstacle[];
  stroke: number;
  gap: number;
  minLength: number;
  maxLength: number;
  curlMin: number;
}

export interface ArrowRequest {
  arrow: DesignedArrowType;
  /** The slot's own arrow, set by hand for the fixed portrait; taken when it touches nothing. */
  designed?: { from: Point; to: Point; bow: 1 | -1 };
  /** Where the tail may start, the likelier first. */
  froms: Point[];
  /** Where on the person this slot would rather point (canvas px). */
  prefer: Point;
  /** The trait's own label: the tail starts beside it. */
  own: Obstacle;
}

export interface PlacedArrow {
  type: DesignedArrowType;
  pose: Pose;
  line: Point[];
  barbs: Point[];
}

/** Below this a set arrow is a stub: a short label sits too close to its target. */
const DESIGNED_MIN_LENGTH = 120;

const CURLY: readonly DesignedArrowType[] = [
  'hand-pfeil-herz',
  'hand-pfeil-spirale',
  'hand-pfeil-schlaufe',
];

/**
 * The best arrow from a trait to the person: from each tail, to each point
 * just off the outline (or on the body, when the trait stands on it), in the
 * slot's stroke or a plain arc, bowed either way — the cheapest by length,
 * aim and preference whose stroke crosses no text, no face, no other arrow
 * and does not run over the person. If every one touches something, the one
 * touching least. Deterministic: a fixed candidate order, strict comparisons.
 */
export function placeArrow(
  req: ArrowRequest,
  scene: ArrowScene,
  placed: PlacedArrow[]
): PlacedArrow {
  const { canvas, person, stroke, gap } = scene;
  const outline = steckbriefOutline(person);
  const face = steckbriefFace(person);
  const centreX = person.x + person.width / 2;
  const keepOut = (p: Point, pad: number) =>
    p.x > face.x - pad &&
    p.x < face.x + face.width + pad &&
    p.y > face.y - pad &&
    p.y < face.y + face.height + pad;
  const edge = edgeTargets(outline, gap, 34).filter(
    ({ at }) =>
      at.x > 30 &&
      at.x < canvas.width - 30 &&
      at.y > 30 &&
      at.y < canvas.height - 30 &&
      !keepOut(at, 10)
  );
  const neck = inFrame(person, [0.5, 0.6]);
  /** From a tail on the body: up towards the neck, fanned out, landing on the body. */
  const onBody = (from: Point) => {
    const d = Math.hypot(neck.x - from.x, neck.y - from.y) || 1;
    const base = Math.atan2((neck.y - from.y) / d - 0.8, (neck.x - from.x) / d);
    return [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05].flatMap((turn) =>
      [220, 280, 340, 160].flatMap((length) => {
        const at = {
          x: from.x + Math.cos(base + turn) * length,
          y: from.y + Math.sin(base + turn) * length,
        };
        return outlineDistance(outline, at) < -20 && !keepOut(at, 30)
          ? [{ at, inward: null, aim: Math.abs(turn) * 40 }]
          : [];
      })
    );
  };
  const types: DesignedArrowType[] =
    req.arrow === 'hand-pfeil-bogen' ? [req.arrow] : [req.arrow, 'hand-pfeil-bogen'];

  type Candidate = {
    cost: number;
    type: DesignedArrowType;
    from: Point;
    to: Point;
    bow: 1 | -1;
    inside: boolean;
  };
  const candidates: Candidate[] = [];
  req.froms.forEach((from, fi) => {
    const inside = outlineDistance(outline, from) < 0;
    // A tail on the hair or the face has nowhere to point.
    if (inside && from.y < neck.y) return;
    const targets = inside
      ? onBody(from)
      : edge.map((e) => ({ at: e.at, inward: e.inward as Point | null, aim: 0 }));
    for (const target of targets) {
      const dx = target.at.x - from.x;
      const dy = target.at.y - from.y;
      const length = Math.hypot(dx, dy);
      if (length < 80 || length > scene.maxLength + 80) continue;
      // Off the body an arrow points down or across to the person, never steeply up and away.
      if (!inside && dy < 0 && -dy > 1.2 * Math.abs(dx)) continue;
      let aim = target.aim;
      if (target.inward) {
        const cos = (dx * target.inward.x + dy * target.inward.y) / length;
        if (cos < 0.15) continue;
        aim = (1 - cos) * 90;
      }
      const lengthCost =
        Math.max(0, scene.minLength - length) * 3 + Math.max(0, length - scene.maxLength) * 3;
      const preferCost = Math.hypot(target.at.x - req.prefer.x, target.at.y - req.prefer.y) * 0.35;
      types.forEach((type, ti) => {
        if (CURLY.includes(type) && length < scene.curlMin) return;
        for (const bow of [1, -1] as const) {
          candidates.push({
            cost: lengthCost + aim + preferCost + fi * 12 + ti * 35,
            type,
            from,
            to: target.at,
            bow,
            inside,
          });
        }
      });
    }
  });
  candidates.sort((a, b) => a.cost - b.cost);

  const pad = stroke / 2 + 12;
  const near = stroke + 14;
  const others = placed.map((other) => {
    const points = [...other.line, ...other.barbs];
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    return {
      points,
      box: { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) },
    };
  });
  const hits = (arrow: PlacedArrow, inside: boolean): number => {
    let count = 0;
    let run = 0;
    const total = arrow.line.reduce(
      (sum, p, i) =>
        i ? sum + Math.hypot(p.x - arrow.line[i - 1]!.x, p.y - arrow.line[i - 1]!.y) : 0,
      0
    );
    const check = (p: Point, along: number) => {
      if (p.x < 14 || p.x > canvas.width - 14 || p.y < 14 || p.y > canvas.height - 14) count++;
      if (keepOut(p, stroke)) count++;
      if (scene.obstacles.some((o) => obstacleHit(o, p, pad))) count++;
      if (along > 26 && obstacleHit(req.own, p, stroke / 2 + 6)) count++;
      if (!inside && along < total - 40 && outlineDistance(outline, p) < -12) count++;
      for (const other of others) {
        const b = other.box;
        if (p.x < b.x0 - near || p.x > b.x1 + near || p.y < b.y0 - near || p.y > b.y1 + near)
          continue;
        if (other.points.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < near)) count++;
      }
    };
    arrow.line.forEach((p, i) => {
      if (i) run += Math.hypot(p.x - arrow.line[i - 1]!.x, p.y - arrow.line[i - 1]!.y);
      check(p, run);
    });
    arrow.barbs.forEach((p) => check(p, total));
    return count;
  };
  /** A sideways run sags; a steep one bows out, away from the person. */
  const bulgeCost = (arrow: PlacedArrow, c: Candidate) => {
    const mid = arrow.line[Math.floor(arrow.line.length / 2)]!;
    const bx = mid.x - (c.from.x + c.to.x) / 2;
    const by = mid.y - (c.from.y + c.to.y) / 2;
    const flat = Math.abs(c.to.x - c.from.x) > Math.abs(c.to.y - c.from.y);
    const want = flat ? { x: 0, y: 1 } : { x: Math.sign(mid.x - centreX) || 1, y: 0 };
    return bx * want.x + by * want.y < 0 ? 18 : 0;
  };

  if (req.designed) {
    const { from, to, bow } = req.designed;
    const pose = arrowPose(req.arrow, from, to, stroke, bow);
    const arrow = { type: req.arrow, pose, ...arrowSamples(req.arrow, pose, stroke) };
    const long = Math.hypot(to.x - from.x, to.y - from.y) >= DESIGNED_MIN_LENGTH;
    if (long && hits(arrow, outlineDistance(outline, from) < 0) === 0) return arrow;
  }

  let best: { arrow: PlacedArrow; score: number } | null = null;
  for (const c of candidates.slice(0, 2500)) {
    if (best && c.cost >= best.score) break;
    const pose = arrowPose(c.type, c.from, c.to, stroke, c.bow);
    const arrow = { type: c.type, pose, ...arrowSamples(c.type, pose, stroke) };
    const score = c.cost + bulgeCost(arrow, c) + hits(arrow, c.inside) * 1000;
    if (!best || score < best.score) best = { arrow, score };
  }
  if (best) return best.arrow;
  // Nowhere to go (no target in reach): a short plain arc towards the preferred point.
  const from = req.froms[0]!;
  const dx = req.prefer.x - from.x;
  const dy = req.prefer.y - from.y;
  const d = Math.hypot(dx, dy) || 1;
  const to = { x: from.x + (dx / d) * scene.minLength, y: from.y + (dy / d) * scene.minLength };
  const pose = arrowPose('hand-pfeil-bogen', from, to, stroke, 1);
  return { type: 'hand-pfeil-bogen', pose, ...arrowSamples('hand-pfeil-bogen', pose, stroke) };
}
