/**
 * Snapping utilities for canvas elements
 * Enables snap-to-center and snap-to-element functionality during drag operations
 *
 * Performance optimizations:
 * - Early exit when both horizontal and vertical snaps are found
 * - Precomputed edge arrays to reduce allocations
 */

import { type Box, type NodeFrame } from './orientation';

export const SNAP_THRESHOLD = 20; // pixels - ~2% of 1000px canvas

// Once snapped to a guide, the cursor must drift this multiple of SNAP_THRESHOLD
// past it before releasing — eliminates the threshold-edge oscillation that
// causes snap to flicker on/off as the cursor crosses the engage boundary.
const SNAP_RELEASE_MULTIPLIER = 2.5;

// When two guides compete on the same axis, the previously-engaged guide gets
// this score advantage in pixels — prevents the snap line from flickering
// between two near-equidistant targets.
const SNAP_SWITCH_HYSTERESIS_PX = 4;

// Tolerance for "is this candidate the same guide we were already snapped to?"
// Sub-pixel distance is treated as the same line.
const SNAP_GUIDE_IDENTITY_PX = 0.5;

export interface SnapHysteresis {
  /** Position (in stage coords) of the vertical guide we are currently snapped to, or null. */
  lastGuidePosH: number | null;
  /** Position (in stage coords) of the horizontal guide we are currently snapped to, or null. */
  lastGuidePosV: number | null;
}

export function createSnapHysteresis(): SnapHysteresis {
  return { lastGuidePosH: null, lastGuidePosV: null };
}

export function resetSnapHysteresis(h: SnapHysteresis): void {
  h.lastGuidePosH = null;
  h.lastGuidePosV = null;
}

export interface SnapResult {
  x: number;
  y: number;
  snapH: boolean;
  snapV: boolean;
}

export interface SnapTarget {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SnapLine {
  orientation: 'horizontal' | 'vertical';
  position: number;
  start: number;
  end: number;
  /** `gap`: Abstandsmarke beim Gleich-verteilen (`snapSpacing`), sonst eine Hilfslinie. */
  kind?: 'gap';
}

export interface ElementSnapResult extends SnapResult {
  snapToElementId?: string;
  snapLines: SnapLine[];
}

/** Dieselben Linien in derselben Reihenfolge? Ohne Anlegen, für den Drag-Pfad. */
export function sameSnapLines(a: readonly SnapLine[], b: readonly SnapLine[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const p = a[i]!;
    const q = b[i]!;
    if (
      p.orientation !== q.orientation ||
      p.position !== q.position ||
      p.start !== q.start ||
      p.end !== q.end ||
      p.kind !== q.kind
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Calculate snapped position for an element
 * Snaps element center to stage center when within threshold
 */
export function calculateSnapPosition(
  nodeX: number,
  nodeY: number,
  nodeWidth: number,
  nodeHeight: number,
  stageWidth: number,
  stageHeight: number,
  hysteresis?: SnapHysteresis
): SnapResult {
  const nodeCenterX = nodeX + nodeWidth / 2;
  const nodeCenterY = nodeY + nodeHeight / 2;
  const stageCenterX = stageWidth / 2;
  const stageCenterY = stageHeight / 2;

  let snapX = nodeX;
  let snapY = nodeY;
  let snapH = false;
  let snapV = false;

  // Sticky thresholds: if we were already snapped to this exact guide, use the
  // wider release threshold so the snap holds until the user clearly drags away.
  const stickyH =
    hysteresis?.lastGuidePosH !== null &&
    hysteresis !== undefined &&
    Math.abs(stageCenterX - hysteresis.lastGuidePosH) < SNAP_GUIDE_IDENTITY_PX;
  const limitH = stickyH ? SNAP_THRESHOLD * SNAP_RELEASE_MULTIPLIER : SNAP_THRESHOLD;

  if (Math.abs(nodeCenterX - stageCenterX) < limitH) {
    snapX = stageCenterX - nodeWidth / 2;
    snapH = true;
  }

  const stickyV =
    hysteresis?.lastGuidePosV !== null &&
    hysteresis !== undefined &&
    Math.abs(stageCenterY - hysteresis.lastGuidePosV) < SNAP_GUIDE_IDENTITY_PX;
  const limitV = stickyV ? SNAP_THRESHOLD * SNAP_RELEASE_MULTIPLIER : SNAP_THRESHOLD;

  if (Math.abs(nodeCenterY - stageCenterY) < limitV) {
    snapY = stageCenterY - nodeHeight / 2;
    snapV = true;
  }

  return { x: snapX, y: snapY, snapH, snapV };
}

/**
 * Snap für mittig verankerte Konva-Gruppen (Icons, Assets, Badges).
 *
 * Deren `x`/`y` ist der Mittelpunkt, `calculateElementSnapPosition` rechnet aber
 * mit der linken oberen Ecke. Die Umrechnung stand mehrfach im Code, jedes Mal
 * mit derselben Gelegenheit, ein `/ 2` zu vergessen.
 */
export function calculateCenteredSnapPosition(
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  targets: SnapTarget[],
  stageWidth: number,
  stageHeight: number,
  hysteresis?: SnapHysteresis
): ElementSnapResult {
  const result = calculateElementSnapPosition(
    centerX - width / 2,
    centerY - height / 2,
    width,
    height,
    targets,
    stageWidth,
    stageHeight,
    hysteresis
  );

  return { ...result, x: result.x + width / 2, y: result.y + height / 2 };
}

/**
 * Calculate snapped position with element-to-element snapping
 * Checks both stage center and other elements for alignment
 *
 * Performance optimizations:
 * - Early exit when both H and V snaps are found
 * - Reuses edge value calculations
 */
export function calculateElementSnapPosition(
  nodeX: number,
  nodeY: number,
  nodeWidth: number,
  nodeHeight: number,
  targets: SnapTarget[],
  stageWidth: number,
  stageHeight: number,
  hysteresis?: SnapHysteresis
): ElementSnapResult {
  const baseResult = calculateSnapPosition(
    nodeX,
    nodeY,
    nodeWidth,
    nodeHeight,
    stageWidth,
    stageHeight,
    hysteresis
  );
  const result: ElementSnapResult = {
    ...baseResult,
    snapLines: [],
  };

  // Best-candidate per-axis state (lower score wins). Center snap from
  // calculateSnapPosition is the seed candidate; element snaps may beat it.
  let bestScoreH = baseResult.snapH ? 0 : Infinity;
  let bestGuidePosH: number | null = baseResult.snapH ? stageWidth / 2 : null;
  let bestScoreV = baseResult.snapV ? 0 : Infinity;
  let bestGuidePosV: number | null = baseResult.snapV ? stageHeight / 2 : null;

  // Seed snap lines from center-snap result
  if (baseResult.snapH) {
    result.snapLines.push({
      orientation: 'vertical',
      position: stageWidth / 2,
      start: 0,
      end: stageHeight,
    });
  }
  if (baseResult.snapV) {
    result.snapLines.push({
      orientation: 'horizontal',
      position: stageHeight / 2,
      start: 0,
      end: stageWidth,
    });
  }

  if (!targets || targets.length === 0) {
    if (hysteresis) {
      hysteresis.lastGuidePosH = bestGuidePosH;
      hysteresis.lastGuidePosV = bestGuidePosV;
    }
    return result;
  }

  // Precompute node edge values once (avoid repeated calculations in loops)
  const nodeEdgeValsH = [nodeX, nodeX + nodeWidth / 2, nodeX + nodeWidth];
  const nodeEdgeOffsetsH = [0, nodeWidth / 2, nodeWidth];
  const nodeEdgeValsV = [nodeY, nodeY + nodeHeight / 2, nodeY + nodeHeight];
  const nodeEdgeOffsetsV = [0, nodeHeight / 2, nodeHeight];

  type BestH = { id: string; pos: number; nodeEdgeIdx: number; targetY: number; targetH: number };
  type BestV = { id: string; pos: number; nodeEdgeIdx: number; targetX: number; targetW: number };
  let bestH: BestH | null = null;
  let bestV: BestV | null = null;

  for (const target of targets) {
    const targetEdgeValsH = [target.x, target.x + target.width / 2, target.x + target.width];
    const targetEdgeValsV = [target.y, target.y + target.height / 2, target.y + target.height];

    // Horizontal candidates (left, center, right edges of target vs node)
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const candidatePos = targetEdgeValsH[j];
        const distance = Math.abs(nodeEdgeValsH[i] - candidatePos);

        const sticky =
          hysteresis !== undefined &&
          hysteresis.lastGuidePosH !== null &&
          Math.abs(candidatePos - hysteresis.lastGuidePosH) < SNAP_GUIDE_IDENTITY_PX;
        const limit = sticky ? SNAP_THRESHOLD * SNAP_RELEASE_MULTIPLIER : SNAP_THRESHOLD;
        if (distance > limit) continue;

        // Sticky guide gets a score advantage so it wins ties against new guides
        const score = distance - (sticky ? SNAP_SWITCH_HYSTERESIS_PX : 0);
        if (score < bestScoreH) {
          bestScoreH = score;
          bestGuidePosH = candidatePos;
          bestH = {
            id: target.id,
            pos: candidatePos,
            nodeEdgeIdx: i,
            targetY: target.y,
            targetH: target.height,
          };
        }
      }
    }

    // Vertical candidates (top, center, bottom edges of target vs node)
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const candidatePos = targetEdgeValsV[j];
        const distance = Math.abs(nodeEdgeValsV[i] - candidatePos);

        const sticky =
          hysteresis !== undefined &&
          hysteresis.lastGuidePosV !== null &&
          Math.abs(candidatePos - hysteresis.lastGuidePosV) < SNAP_GUIDE_IDENTITY_PX;
        const limit = sticky ? SNAP_THRESHOLD * SNAP_RELEASE_MULTIPLIER : SNAP_THRESHOLD;
        if (distance > limit) continue;

        const score = distance - (sticky ? SNAP_SWITCH_HYSTERESIS_PX : 0);
        if (score < bestScoreV) {
          bestScoreV = score;
          bestGuidePosV = candidatePos;
          bestV = {
            id: target.id,
            pos: candidatePos,
            nodeEdgeIdx: i,
            targetX: target.x,
            targetW: target.width,
          };
        }
      }
    }
  }

  // If an element snap won over the center snap on H axis, replace position + line
  if (bestH && bestGuidePosH !== stageWidth / 2) {
    result.x = bestH.pos - nodeEdgeOffsetsH[bestH.nodeEdgeIdx];
    result.snapH = true;
    result.snapToElementId = bestH.id;
    result.snapLines = result.snapLines.filter((l) => l.orientation !== 'vertical');
    result.snapLines.push({
      orientation: 'vertical',
      position: bestH.pos,
      start: Math.min(nodeY, bestH.targetY),
      end: Math.max(nodeY + nodeHeight, bestH.targetY + bestH.targetH),
    });
  }

  if (bestV && bestGuidePosV !== stageHeight / 2) {
    result.y = bestV.pos - nodeEdgeOffsetsV[bestV.nodeEdgeIdx];
    result.snapV = true;
    result.snapToElementId = bestV.id;
    result.snapLines = result.snapLines.filter((l) => l.orientation !== 'horizontal');
    result.snapLines.push({
      orientation: 'horizontal',
      position: bestV.pos,
      start: Math.min(nodeX, bestV.targetX),
      end: Math.max(nodeX + nodeWidth, bestV.targetX + bestV.targetW),
    });
  }

  // Persist engaged guide positions for next call's sticky check
  if (hysteresis) {
    hysteresis.lastGuidePosH = result.snapH ? bestGuidePosH : null;
    hysteresis.lastGuidePosV = result.snapV ? bestGuidePosV : null;
  }

  return result;
}

/**
 * Leerer Rahmen zum Wiederverwenden: `boxFrame` beschreibt ihn pro Frame neu,
 * damit der Drag-Pfad nichts anlegen muss.
 */
export function createBoxFrame(): NodeFrame {
  return {
    x: 0,
    y: 0,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    offsetX: 0,
    offsetY: 0,
    local: { x: 0, y: 0, width: 0, height: 0 },
  };
}

/**
 * Beschreibt `frame` als Box aus bekannten Props neu (kein `getClientRect`, kein
 * Baumdurchlauf). `width`/`height` sind die gerenderten (schon skalierten) Masse;
 * gedreht wird um den Knotenursprung — oben links (`top-left`) oder die Mitte
 * (`centre`). Eine Spiegelung ändert die Box nicht und bleibt deshalb draussen.
 */
export function boxFrame(
  frame: NodeFrame,
  x: number,
  y: number,
  width: number,
  height: number,
  rotation: number,
  pivot: 'top-left' | 'centre'
): NodeFrame {
  const w = Math.abs(width);
  const h = Math.abs(height);
  frame.x = x;
  frame.y = y;
  frame.rotation = rotation;
  frame.scaleX = 1;
  frame.scaleY = 1;
  frame.offsetX = 0;
  frame.offsetY = 0;
  frame.local.x = pivot === 'centre' ? -w / 2 : 0;
  frame.local.y = pivot === 'centre' ? -h / 2 : 0;
  frame.local.width = w;
  frame.local.height = h;
  return frame;
}

// Ergebnis von `measureFrame`, relativ zum Knotenursprung. Modulweit, damit der
// Drag-Pfad nichts anlegt; gelesen wird es sofort nach dem Aufruf.
const measured = { minX: 0, minY: 0, width: 0, height: 0 };

/**
 * Achsparallele Box der vier gedrehten Ecken, relativ zu (frame.x, frame.y).
 * Anders als `axisAlignedBounds` ohne Rundung: bei 0° muss das Ergebnis Bit für
 * Bit dem alten Rechenweg entsprechen.
 */
function measureFrame(frame: NodeFrame): void {
  const rad = (frame.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const x0 = (frame.local.x - frame.offsetX) * frame.scaleX;
  const x1 = (frame.local.x + frame.local.width - frame.offsetX) * frame.scaleX;
  const y0 = (frame.local.y - frame.offsetY) * frame.scaleY;
  const y1 = (frame.local.y + frame.local.height - frame.offsetY) * frame.scaleY;

  const ax = x0 * cos - y0 * sin;
  const bx = x1 * cos - y0 * sin;
  const cx = x1 * cos - y1 * sin;
  const dx = x0 * cos - y1 * sin;
  const ay = x0 * sin + y0 * cos;
  const by = x1 * sin + y0 * cos;
  const cy = x1 * sin + y1 * cos;
  const dy = x0 * sin + y1 * cos;

  const minX = Math.min(ax, bx, cx, dx);
  const minY = Math.min(ay, by, cy, dy);
  measured.minX = minX;
  measured.minY = minY;
  measured.width = Math.max(ax, bx, cx, dx) - minX;
  measured.height = Math.max(ay, by, cy, dy) - minY;
}

/** Sichtbare, achsparallele Box eines Rahmens in Bühnenkoordinaten. */
export function frameBounds(frame: NodeFrame): Box {
  measureFrame(frame);
  return {
    x: frame.x + measured.minX,
    y: frame.y + measured.minY,
    width: measured.width,
    height: measured.height,
  };
}

/**
 * Snap über die sichtbare (gedrehte) Box: sie rastet wie eine oben links
 * verankerte Box ein, und der Knoten wandert um dieselbe Strecke. Bei 0° gleicht
 * das Ergebnis exakt `calculateElementSnapPosition` (oben links) bzw.
 * `calculateCenteredSnapPosition` (mittig).
 */
export function snapByBounds(
  frame: NodeFrame,
  targets: SnapTarget[],
  stageWidth: number,
  stageHeight: number,
  hysteresis?: SnapHysteresis
): ElementSnapResult {
  measureFrame(frame);
  const { minX, minY, width, height } = measured;
  const result = calculateElementSnapPosition(
    frame.x + minX,
    frame.y + minY,
    width,
    height,
    targets,
    stageWidth,
    stageHeight,
    hysteresis
  );
  result.x -= minX;
  result.y -= minY;
  return result;
}
