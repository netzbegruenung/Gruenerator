/**
 * Snap und Snap-Ziel eines Elements, dessen sichtbare Box aus seinen Props
 * folgt — dasselbe Muster wie Icon, Asset und Text, für Formen, Rahmen,
 * Nutzerbilder, Diagramme und Illustrationen an einer Stelle.
 *
 * Pro Bild liest der Zug nur x, y und Drehung des Knotens; Breite und Höhe
 * kommen aus den Props. Kein `getClientRect`, kein Baumdurchlauf, kein
 * React-Zustand — die Hilfslinien schreibt `useSnapScheduler` einmal je Bild.
 */

import { useCallback, useEffect } from 'react';

import { isGroupDrag } from '../utils/multiSelect';
import { boxFrame, createBoxFrame, frameBounds, snapByBounds } from '../utils/snapping';

import { useGeometryReporter, type GeometryReporter } from './useGeometryReporter';
import { useSnapScheduler } from './useSnapScheduler';

import type { SnapLine, SnapTarget } from '../utils/snapping';
import type Konva from 'konva';

export interface BoxSnapOptions {
  id: string;
  getSnapTargets?: (id: string) => SnapTarget[];
  stageWidth?: number;
  stageHeight?: number;
  onSnapChange?: (snapH: boolean, snapV: boolean) => void;
  onSnapLinesChange?: (lines: SnapLine[]) => void;
  onGeometryChange?: GeometryReporter;
}

/** Was ein Primitiv für Snap und Snap-Ziel von aussen bekommt. */
export type SnapProps = Omit<BoxSnapOptions, 'id'>;

/** Die gerenderte Box: Lage des Knotens, sichtbare (skalierte) Masse, Drehpunkt. */
export interface RenderedBox {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  pivot: 'top-left' | 'centre';
}

// Einmal je Modul: die Rechnung liest den Rahmen sofort wieder aus.
const dragFrame = createBoxFrame();
const NOOP = () => {};

export function useBoxSnap(options: BoxSnapOptions, box: RenderedBox) {
  const { id, getSnapTargets, stageWidth, stageHeight, onGeometryChange } = options;
  const snap = useSnapScheduler({
    onSnapChange: options.onSnapChange ?? NOOP,
    onSnapLinesChange: options.onSnapLinesChange ?? NOOP,
  });
  const { hysteresis, scheduleSnap } = snap;

  const reportGeometry = useGeometryReporter(id, onGeometryChange);
  const { x, y, width, height, rotation, pivot } = box;
  useEffect(() => {
    const bounds = frameBounds(boxFrame(dragFrame, x, y, width, height, rotation, pivot));
    reportGeometry(bounds.x, bounds.y, bounds.width, bounds.height);
  }, [reportGeometry, x, y, width, height, rotation, pivot]);

  const onDragMove = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      if (!stageWidth || !stageHeight) return;
      const node = e.target;
      if (node !== e.currentTarget || isGroupDrag(node)) return;
      const result = snapByBounds(
        boxFrame(dragFrame, node.x(), node.y(), width, height, node.rotation(), pivot),
        getSnapTargets?.(id) ?? [],
        stageWidth,
        stageHeight,
        hysteresis
      );
      node.position({ x: result.x, y: result.y });
      scheduleSnap(result.snapH, result.snapV, result.snapLines);
    },
    // Die Masse ändern sich nur bei einer Grössenänderung, nie während des Zugs.
    [id, getSnapTargets, stageWidth, stageHeight, width, height, pivot, hysteresis, scheduleSnap]
  );

  return { onDragStart: snap.onDragStart, onDragMove, onDragEnd: snap.onDragEnd };
}
