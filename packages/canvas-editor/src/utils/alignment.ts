/**
 * Alignment & Distribution Utilities
 *
 * Provides alignment functions for canvas elements relative to canvas bounds.
 * Operates on element position/size data to compute aligned coordinates.
 */

export type AlignmentH = 'left' | 'center-h' | 'right';
export type AlignmentV = 'top' | 'center-v' | 'bottom';
export type Alignment = AlignmentH | AlignmentV;

export interface ElementBounds {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Calculate the aligned X position for a single element relative to canvas bounds.
 */
export function alignElementX(
  el: ElementBounds,
  canvasWidth: number,
  alignment: AlignmentH
): number {
  switch (alignment) {
    case 'left':
      return 0;
    case 'center-h':
      return (canvasWidth - el.width) / 2;
    case 'right':
      return canvasWidth - el.width;
  }
}

/**
 * Calculate the aligned Y position for a single element relative to canvas bounds.
 */
export function alignElementY(
  el: ElementBounds,
  canvasHeight: number,
  alignment: AlignmentV
): number {
  switch (alignment) {
    case 'top':
      return 0;
    case 'center-v':
      return (canvasHeight - el.height) / 2;
    case 'bottom':
      return canvasHeight - el.height;
  }
}

/**
 * Distribute elements evenly along the horizontal axis.
 * Elements are sorted by X position, then spaced evenly between the leftmost and rightmost.
 * Returns a map of element ID → new X position.
 */
export function distributeHorizontally(elements: ElementBounds[]): Map<string, number> {
  const result = new Map<string, number>();
  if (elements.length <= 2) return result;

  const sorted = [...elements].sort((a, b) => a.x - b.x);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const totalSpan = last.x + last.width - first.x;
  const totalElementWidth = sorted.reduce((sum, el) => sum + el.width, 0);
  const gap = (totalSpan - totalElementWidth) / (sorted.length - 1);

  let currentX = first.x;
  for (const el of sorted) {
    result.set(el.id, currentX);
    currentX += el.width + gap;
  }

  return result;
}

/**
 * Distribute elements evenly along the vertical axis.
 * Returns a map of element ID → new Y position.
 */
export function distributeVertically(elements: ElementBounds[]): Map<string, number> {
  const result = new Map<string, number>();
  if (elements.length <= 2) return result;

  const sorted = [...elements].sort((a, b) => a.y - b.y);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const totalSpan = last.y + last.height - first.y;
  const totalElementHeight = sorted.reduce((sum, el) => sum + el.height, 0);
  const gap = (totalSpan - totalElementHeight) / (sorted.length - 1);

  let currentY = first.y;
  for (const el of sorted) {
    result.set(el.id, currentY);
    currentY += el.height + gap;
  }

  return result;
}
