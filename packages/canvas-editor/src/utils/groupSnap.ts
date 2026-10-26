/**
 * Snap beim Gruppenzug: der Umriss aller gezogenen Knoten rastet ein, und jeder
 * Knoten wandert um dieselbe Strecke.
 *
 * Gemessen wird einmal beim Zugbeginn: je Knoten der Abstand seiner (gedrehten)
 * Box zu seinem Ursprung. Drehung und Skala ändern sich beim Ziehen nicht, also
 * reicht danach pro Bild x/y des Knotens — kein `getClientRect` im Zug.
 */

import { boxFrame, createBoxFrame, snapByBounds } from './snapping';

import type { ElementSnapResult, SnapHysteresis, SnapTarget } from './snapping';
import type Konva from 'konva';

export interface GroupSnap {
  nodes: readonly Konva.Node[];
  /** Je Knoten: linke, obere, rechte, untere Kante relativ zu x/y. */
  edges: Float64Array;
  targets: SnapTarget[];
}

/** Zugbeginn: Kanten je Knoten messen, Ziele ohne die Auswahl festhalten. */
export function measureGroupSnap(
  nodes: readonly Konva.Node[],
  targets: SnapTarget[],
  selectedIds: readonly string[]
): GroupSnap {
  const edges = new Float64Array(nodes.length * 4);
  nodes.forEach((node, i) => {
    const parent = node.getParent() ?? undefined;
    const r = node.getClientRect({ relativeTo: parent, skipShadow: true, skipStroke: true });
    edges[i * 4] = r.x - node.x();
    edges[i * 4 + 1] = r.y - node.y();
    edges[i * 4 + 2] = r.x + r.width - node.x();
    edges[i * 4 + 3] = r.y + r.height - node.y();
  });
  const selected = new Set(selectedIds);
  return { nodes, edges, targets: targets.filter((t) => !selected.has(t.id)) };
}

const frame = createBoxFrame();

/**
 * Ein Bild des Gruppenzugs: Umriss aus den aktuellen Positionen, einrasten,
 * alle Knoten um die Differenz schieben. Gibt das Snap-Ergebnis für die
 * Hilfslinien zurück und ob etwas verschoben wurde.
 */
export function snapGroup(
  group: GroupSnap,
  stageWidth: number,
  stageHeight: number,
  hysteresis: SnapHysteresis
): { result: ElementSnapResult; moved: boolean } {
  const { nodes, edges } = group;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (let i = 0; i < nodes.length; i++) {
    const x = nodes[i]!.x();
    const y = nodes[i]!.y();
    left = Math.min(left, x + edges[i * 4]!);
    top = Math.min(top, y + edges[i * 4 + 1]!);
    right = Math.max(right, x + edges[i * 4 + 2]!);
    bottom = Math.max(bottom, y + edges[i * 4 + 3]!);
  }
  const result = snapByBounds(
    boxFrame(frame, left, top, right - left, bottom - top, 0, 'top-left'),
    group.targets,
    stageWidth,
    stageHeight,
    hysteresis
  );
  const dx = result.x - left;
  const dy = result.y - top;
  const moved = dx !== 0 || dy !== 0;
  if (moved) {
    for (const node of nodes) node.position({ x: node.x() + dx, y: node.y() + dy });
  }
  return { result, moved };
}
