/**
 * SnapGuidelines - Visual guidelines shown when elements snap to center or other elements
 *
 * Subscribes to snap state directly from the store to avoid re-rendering
 * the parent GenericCanvas on every snap line change during drag.
 *
 * Gezeichnet werden nur die gemeldeten Linien. Rastet die Seitenmitte ein, ist
 * sie selbst eine davon; die Achsen-Flags (`snapGuides`) sagen nur „eingerastet",
 * nicht „an der Mitte" — als Mittellinie gelesen, malten sie neben jede
 * Element-Linie eine falsche Seitenmitte.
 */

import { memo } from 'react';
import { Line } from 'react-konva';

import { useCanvasStoreShallow } from '../stores/CanvasStoreProvider';

import type { SnapLine } from '../utils/snapping';

export interface SnapGuidelinesProps {
  color?: string;
}

function SnapGuidelinesInner({ color = '#0066ff' }: SnapGuidelinesProps) {
  const snapLines = useCanvasStoreShallow((s) => s.snapLines);

  if (snapLines.length === 0) return null;

  return (
    <>
      {snapLines.map((line: SnapLine, index: number) => (
        <Line
          key={`snap-line-${index}`}
          points={
            line.orientation === 'vertical'
              ? [line.position, line.start, line.position, line.end]
              : [line.start, line.position, line.end, line.position]
          }
          stroke={color}
          strokeWidth={1}
          dash={[4, 4]}
          listening={false}
        />
      ))}
    </>
  );
}

export const SnapGuidelines = memo(SnapGuidelinesInner);
