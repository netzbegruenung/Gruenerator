export const PROFILBILD_SNAP_THRESHOLD = 12;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SnapResult {
  x: number;
  y: number;
  /** x of the vertical guide the person snapped to, if any. */
  guideX: number | null;
  /** y of the horizontal guide the person snapped to, if any. */
  guideY: number | null;
}

export function gridLines(size: number) {
  return [size / 3, size / 2, (size * 2) / 3];
}

function nearest(edges: number[], targets: number[], threshold: number) {
  let best: { delta: number; target: number } | null = null;
  for (const edge of edges) {
    for (const target of targets) {
      const delta = target - edge;
      if (Math.abs(delta) <= threshold && (!best || Math.abs(delta) < Math.abs(best.delta))) {
        best = { delta, target };
      }
    }
  }
  return best;
}

/**
 * Snaps the person's edges and centre to the thirds and centre lines, and its
 * bottom to the canvas bottom, per axis to the closest guide within the threshold.
 */
export function snapPerson(
  rect: Rect,
  size: number,
  threshold = PROFILBILD_SNAP_THRESHOLD
): SnapResult {
  const lines = gridLines(size);
  const h = nearest([rect.x, rect.x + rect.width / 2, rect.x + rect.width], lines, threshold);
  const v = nearest(
    [rect.y, rect.y + rect.height / 2, rect.y + rect.height],
    [...lines, size],
    threshold
  );
  return {
    x: rect.x + (h?.delta ?? 0),
    y: rect.y + (v?.delta ?? 0),
    guideX: h?.target ?? null,
    guideY: v?.target ?? null,
  };
}

/** Keeps the person's centre on the canvas so it can't be dragged out of reach. */
export function clampPerson(rect: Rect, size: number) {
  return {
    x: Math.min(Math.max(rect.x, -rect.width / 2), size - rect.width / 2),
    y: Math.min(Math.max(rect.y, -rect.height / 2), size - rect.height / 2),
  };
}

export interface CentredBox {
  /** Centre x. */
  x: number;
  /** Centre y. */
  y: number;
  width: number;
  height: number;
  /** Degrees around the centre. */
  rotation: number;
}

/** Axis-aligned bounds of a box rotated around its centre. */
export function rotatedBounds(box: CentredBox): Rect {
  const rad = (box.rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const width = box.width * cos + box.height * sin;
  const height = box.width * sin + box.height * cos;
  return { x: box.x - width / 2, y: box.y - height / 2, width, height };
}

/** Clamps and snaps a sticker by its rotated bounds; returns the new centre. */
export function snapSticker(
  box: CentredBox,
  size: number,
  threshold = PROFILBILD_SNAP_THRESHOLD
): SnapResult {
  const bounds = rotatedBounds(box);
  const snapped = snapPerson({ ...bounds, ...clampPerson(bounds, size) }, size, threshold);
  return {
    ...snapped,
    x: snapped.x + bounds.width / 2,
    y: snapped.y + bounds.height / 2,
  };
}
