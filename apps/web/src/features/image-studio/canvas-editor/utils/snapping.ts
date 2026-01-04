/**
 * Snapping utilities for canvas elements
 * Enables snap-to-center and snap-to-element functionality during drag operations
 */

export const SNAP_THRESHOLD = 20; // pixels - ~2% of 1000px canvas

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
 * Calculate snapped position with element-to-element snapping
 * Checks both stage center and other elements for alignment
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

  // Check element-to-element snapping
  // Track if we found element snaps (separate from center snaps)
  let elementSnapH = false;
  let elementSnapV = false;

  for (const target of targets) {
    // Horizontal alignment (left, center, right edges)
    if (!elementSnapH) {
      const nodeEdges = [
        { name: 'left', val: nodeX, offset: 0 },
        { name: 'center', val: nodeX + nodeWidth / 2, offset: nodeWidth / 2 },
        { name: 'right', val: nodeX + nodeWidth, offset: nodeWidth },
      ];
      const targetEdges = [
        { name: 'left', val: target.x },
        { name: 'center', val: target.x + target.width / 2 },
        { name: 'right', val: target.x + target.width },
      ];

      for (const nodeEdge of nodeEdges) {
        for (const targetEdge of targetEdges) {
          if (Math.abs(nodeEdge.val - targetEdge.val) < SNAP_THRESHOLD) {
            // Only snap position if not already snapped to center
            if (!result.snapH) {
              result.x = targetEdge.val - nodeEdge.offset;
              result.snapH = true;
              result.snapToElementId = target.id;
            }
            // Always add element snap line for visual feedback
            elementSnapH = true;
            result.snapLines.push({
              orientation: 'vertical',
              position: targetEdge.val,
              start: Math.min(nodeY, target.y),
              end: Math.max(nodeY + nodeHeight, target.y + target.height),
            });
            break;
          }
        }
        if (elementSnapH) break;
      }
    }

    // Vertical alignment (top, center, bottom edges)
    if (!elementSnapV) {
      const nodeVEdges = [
        { name: 'top', val: nodeY, offset: 0 },
        { name: 'center', val: nodeY + nodeHeight / 2, offset: nodeHeight / 2 },
        { name: 'bottom', val: nodeY + nodeHeight, offset: nodeHeight },
      ];
      const targetVEdges = [
        { name: 'top', val: target.y },
        { name: 'center', val: target.y + target.height / 2 },
        { name: 'bottom', val: target.y + target.height },
      ];

      for (const nodeEdge of nodeVEdges) {
        for (const targetEdge of targetVEdges) {
          if (Math.abs(nodeEdge.val - targetEdge.val) < SNAP_THRESHOLD) {
            // Only snap position if not already snapped to center
            if (!result.snapV) {
              result.y = targetEdge.val - nodeEdge.offset;
              result.snapV = true;
              result.snapToElementId = target.id;
            }
            // Always add element snap line for visual feedback
            elementSnapV = true;
            result.snapLines.push({
              orientation: 'horizontal',
              position: targetEdge.val,
              start: Math.min(nodeX, target.x),
              end: Math.max(nodeX + nodeWidth, target.x + target.width),
            });
            break;
          }
        }
        if (elementSnapV) break;
      }
    }
  }

  return result;
}
