/**
 * Snapping utilities for canvas elements
 * Enables snap-to-center and snap-to-element functionality during drag operations
 *
 * Performance optimizations:
 * - Early exit when both horizontal and vertical snaps are found
 * - Precomputed edge arrays to reduce allocations
 * - Bounding box overlap check to skip distant elements
 */

export const SNAP_THRESHOLD = 20; // pixels - ~2% of 1000px canvas

// Extended threshold for bounding box pre-check (skip elements that are far away)
const SNAP_PROXIMITY_THRESHOLD = 200;

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
}

export interface ElementSnapResult extends SnapResult {
  snapToElementId?: string;
  snapLines: SnapLine[];
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
 * Check if two bounding boxes are within proximity for snapping consideration
 * This is a fast pre-check to skip distant elements
 */
function isWithinSnapProximity(
  nodeX: number,
  nodeY: number,
  nodeWidth: number,
  nodeHeight: number,
  target: SnapTarget
): boolean {
  // Check if bounding boxes (expanded by proximity threshold) overlap
  const nodeRight = nodeX + nodeWidth;
  const nodeBottom = nodeY + nodeHeight;
  const targetRight = target.x + target.width;
  const targetBottom = target.y + target.height;

  // Expand both boxes by proximity threshold and check overlap
  return !(
    nodeX - SNAP_PROXIMITY_THRESHOLD > targetRight ||
    nodeRight + SNAP_PROXIMITY_THRESHOLD < target.x ||
    nodeY - SNAP_PROXIMITY_THRESHOLD > targetBottom ||
    nodeBottom + SNAP_PROXIMITY_THRESHOLD < target.y
  );
}

/**
 * Calculate snapped position with element-to-element snapping
 * Checks both stage center and other elements for alignment
 *
 * Performance optimizations:
 * - Early exit when both H and V snaps are found
 * - Proximity pre-check to skip distant elements
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
    if (!isWithinSnapProximity(nodeX, nodeY, nodeWidth, nodeHeight, target)) {
      continue;
    }

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
