// SPDX-License-Identifier: MPL-2.0
/**
 * Ausrichten & Verteilen: reine Geometrie über achsenparallele Kästen.
 * Die Befehle reichen die gedrehten Umrisse (`axisAlignedBounds`) herein und
 * verschieben jedes Element um den zurückgegebenen Versatz.
 */

import type { Box } from './orientation';

export type AlignDirection = 'left' | 'center-h' | 'right' | 'top' | 'center-v' | 'bottom';

export interface Delta {
  x: number;
  y: number;
}

/** Versatz, der `box` an `target` ausrichtet. */
export function alignDelta(box: Box, target: Box, dir: AlignDirection): Delta {
  switch (dir) {
    case 'left':
      return { x: target.x - box.x, y: 0 };
    case 'center-h':
      return { x: target.x + (target.width - box.width) / 2 - box.x, y: 0 };
    case 'right':
      return { x: target.x + target.width - (box.x + box.width), y: 0 };
    case 'top':
      return { x: 0, y: target.y - box.y };
    case 'center-v':
      return { x: 0, y: target.y + (target.height - box.height) / 2 - box.y };
    case 'bottom':
      return { x: 0, y: target.y + target.height - (box.y + box.height) };
  }
}

/** Kleinster Kasten um alle. */
export function unionBox(boxes: readonly Box[]): Box {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.width));
  const bottom = Math.max(...boxes.map((b) => b.y + b.height));
  return { x, y, width: right - x, height: bottom - y };
}

/**
 * Gleiche Abstände zwischen den Kästen entlang `axis`; der erste und der
 * letzte bleiben stehen. Versätze in der Reihenfolge der Eingabe; unter drei
 * Kästen gibt es nichts zu verteilen.
 */
export function distributeDeltas(boxes: readonly Box[], axis: 'x' | 'y'): Delta[] {
  const deltas = boxes.map(() => ({ x: 0, y: 0 }));
  if (boxes.length < 3) return deltas;
  const start = (b: Box) => (axis === 'x' ? b.x : b.y);
  const size = (b: Box) => (axis === 'x' ? b.width : b.height);
  const order = boxes.map((_, i) => i).sort((a, b) => start(boxes[a]!) - start(boxes[b]!));
  const first = boxes[order[0]!]!;
  const last = boxes[order[order.length - 1]!]!;
  const span = start(last) + size(last) - start(first);
  const gap = (span - boxes.reduce((sum, b) => sum + size(b), 0)) / (boxes.length - 1);
  let cursor = start(first);
  for (const i of order) {
    deltas[i]![axis] = cursor - start(boxes[i]!);
    cursor += size(boxes[i]!) + gap;
  }
  return deltas;
}
