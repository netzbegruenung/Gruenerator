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
  stageHeight: number
): SnapResult {
  const nodeCenterX = nodeX + nodeWidth / 2;
  const nodeCenterY = nodeY + nodeHeight / 2;
  const stageCenterX = stageWidth / 2;
  const stageCenterY = stageHeight / 2;

  let snapX = nodeX;
  let snapY = nodeY;
  let snapH = false;
  let snapV = false;

  // Snap to horizontal center (vertical line)
  if (Math.abs(nodeCenterX - stageCenterX) < SNAP_THRESHOLD) {
    snapX = stageCenterX - nodeWidth / 2;
    snapH = true;
  }

  // Snap to vertical center (horizontal line)
  if (Math.abs(nodeCenterY - stageCenterY) < SNAP_THRESHOLD) {
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
  stageHeight: number
): ElementSnapResult {
  const baseResult = calculateSnapPosition(nodeX, nodeY, nodeWidth, nodeHeight, stageWidth, stageHeight);
  const result: ElementSnapResult = {
    ...baseResult,
    snapLines: [],
  };

  // Add center snap lines if snapped to center
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

  // Early exit if already snapped to center in both directions
  if (result.snapH && result.snapV) {
    return result;
  }

  // Skip element snapping if no targets
  if (!targets || targets.length === 0) {
    return result;
  }

  // Precompute node edge values once (avoid repeated calculations in loops)
  const nodeEdgeValsH = [nodeX, nodeX + nodeWidth / 2, nodeX + nodeWidth];
  const nodeEdgeOffsetsH = [0, nodeWidth / 2, nodeWidth];
  const nodeEdgeValsV = [nodeY, nodeY + nodeHeight / 2, nodeY + nodeHeight];
  const nodeEdgeOffsetsV = [0, nodeHeight / 2, nodeHeight];

  // Track if we found element snaps (separate from center snaps)
  let elementSnapH = false;
  let elementSnapV = false;

  for (const target of targets) {
    // Early exit if we found both snaps
    if (elementSnapH && elementSnapV) break;

    // Proximity pre-check: skip targets that are too far away
    if (!isWithinSnapProximity(nodeX, nodeY, nodeWidth, nodeHeight, target)) {
      continue;
    }

    // Precompute target edge values
    const targetEdgeValsH = [target.x, target.x + target.width / 2, target.x + target.width];
    const targetEdgeValsV = [target.y, target.y + target.height / 2, target.y + target.height];

    // Horizontal alignment (left, center, right edges)
    if (!elementSnapH && !result.snapH) {
      outerH: for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          if (Math.abs(nodeEdgeValsH[i] - targetEdgeValsH[j]) < SNAP_THRESHOLD) {
            result.x = targetEdgeValsH[j] - nodeEdgeOffsetsH[i];
            result.snapH = true;
            result.snapToElementId = target.id;
            elementSnapH = true;
            result.snapLines.push({
              orientation: 'vertical',
              position: targetEdgeValsH[j],
              start: Math.min(nodeY, target.y),
              end: Math.max(nodeY + nodeHeight, target.y + target.height),
            });
            break outerH;
          }
        }
      }
    }

    // Vertical alignment (top, center, bottom edges)
    if (!elementSnapV && !result.snapV) {
      outerV: for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          if (Math.abs(nodeEdgeValsV[i] - targetEdgeValsV[j]) < SNAP_THRESHOLD) {
            result.y = targetEdgeValsV[j] - nodeEdgeOffsetsV[i];
            result.snapV = true;
            result.snapToElementId = target.id;
            elementSnapV = true;
            result.snapLines.push({
              orientation: 'horizontal',
              position: targetEdgeValsV[j],
              start: Math.min(nodeX, target.x),
              end: Math.max(nodeX + nodeWidth, target.x + target.width),
            });
            break outerV;
          }
        }
      }
    }
  }

  return result;
}
