import type Konva from 'konva';

/**
 * Drehen & Spiegeln: reine Geometrie.
 * Transform eines Knotens: translate(x,y) · rotate · scale · translate(-offset).
 */

export const ROTATION_SNAPS: readonly number[] = [0, 45, 90, 135, 180, 225, 270, 315];
export const ROTATION_SNAP_TOLERANCE = 5;

/** Auf jeden Element-Transformer spreaden; `rotateEnabled` bleibt je Primitive. */
export const ELEMENT_TRANSFORMER = {
  // Veränderbare Kopie: Konvas Typ verlangt number[]; `as const` würde ein readonly-Tupel daraus machen.
  rotationSnaps: [...ROTATION_SNAPS] as number[],
  rotationSnapTolerance: ROTATION_SNAP_TOLERANCE,
  flipEnabled: false,
} as const;

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NodeFrame {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
  /** Box im Knotenraum (getClientRect mit skipTransform). */
  local: Box;
}

// Rundet auf 1e-6 und macht aus -0 eine 0.
const clean = (n: number): number => Math.round(n * 1e6) / 1e6 + 0;

export function normalizeRotation(deg: number): number {
  const r = deg % 360;
  const wrapped = r > 180 ? r - 360 : r <= -180 ? r + 360 : r;
  return clean(wrapped);
}

export function readNodeFrame(node: Konva.Node): NodeFrame {
  const local = node.getClientRect({ skipTransform: true, skipShadow: true, skipStroke: true });
  return {
    x: node.x(),
    y: node.y(),
    rotation: node.rotation(),
    scaleX: node.scaleX(),
    scaleY: node.scaleY(),
    offsetX: node.offsetX(),
    offsetY: node.offsetY(),
    local: { x: local.x, y: local.y, width: local.width, height: local.height },
  };
}

const toStage = (
  f: NodeFrame,
  p: { x: number; y: number },
  rotation: number,
  scaleX: number,
  scaleY: number,
  origin: { x: number; y: number }
): { x: number; y: number } => {
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const sx = (p.x - f.offsetX) * scaleX;
  const sy = (p.y - f.offsetY) * scaleY;
  return { x: origin.x + sx * cos - sy * sin, y: origin.y + sx * sin + sy * cos };
};

const localCentre = (f: NodeFrame) => ({
  x: f.local.x + f.local.width / 2,
  y: f.local.y + f.local.height / 2,
});

export function centreOf(frame: NodeFrame): { x: number; y: number } {
  const c = toStage(frame, localCentre(frame), frame.rotation, frame.scaleX, frame.scaleY, frame);
  return { x: clean(c.x), y: clean(c.y) };
}

/** Neue x/y, damit die Mitte beim Drehen/Spiegeln auf dem Fleck bleibt. */
export function placeKeepingCentre(
  frame: NodeFrame,
  next: { rotation: number; scaleX?: number; scaleY?: number }
): { x: number; y: number } {
  const centre = centreOf(frame);
  const offset = toStage(
    frame,
    localCentre(frame),
    next.rotation,
    next.scaleX ?? frame.scaleX,
    next.scaleY ?? frame.scaleY,
    { x: 0, y: 0 }
  );
  return { x: clean(centre.x - offset.x), y: clean(centre.y - offset.y) };
}

export function axisAlignedBounds(frame: NodeFrame): Box {
  const { x: l, y: t, width: w, height: h } = frame.local;
  const corners = [
    { x: l, y: t },
    { x: l + w, y: t },
    { x: l + w, y: t + h },
    { x: l, y: t + h },
  ].map((p) => toStage(frame, p, frame.rotation, frame.scaleX, frame.scaleY, frame));
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    x: clean(minX),
    y: clean(minY),
    width: clean(Math.max(...xs) - minX),
    height: clean(Math.max(...ys) - minY),
  };
}

export function signedScale(magnitude: number, flipped: boolean): number {
  const m = Math.abs(magnitude);
  return flipped ? -m : m;
}
