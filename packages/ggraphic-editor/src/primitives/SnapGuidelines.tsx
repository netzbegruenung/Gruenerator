// SPDX-License-Identifier: MPL-2.0
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

import type { SnapLine } from '@ggraphic/editor/utils/snapping';

export interface SnapGuidelinesProps {
  color?: string;
  /** Abstandsmarken beim Gleich-verteilen. */
  gapColor?: string;
}

/** Halbe Höhe der Endstriche einer Abstandsmarke. */
const GAP_TICK = 6;

/** Eine Abstandsmarke |—| als ein Linienzug: Strich, Strecke, Strich. */
function gapPoints(line: SnapLine): number[] {
  const { start: s, end: e, position: p } = line;
  return line.orientation === 'horizontal'
    ? [s, p - GAP_TICK, s, p + GAP_TICK, s, p, e, p, e, p - GAP_TICK, e, p + GAP_TICK]
    : [p - GAP_TICK, s, p + GAP_TICK, s, p, s, p, e, p - GAP_TICK, e, p + GAP_TICK, e];
}

function SnapGuidelinesInner({ color = '#0066ff', gapColor = '#e6007e' }: SnapGuidelinesProps) {
  const snapLines = useCanvasStoreShallow((s) => s.snapLines);

  if (snapLines.length === 0) return null;

  return (
    <>
      {snapLines.map((line: SnapLine, index: number) =>
        line.kind === 'gap' ? (
          <Line
            key={`snap-line-${index}`}
            points={gapPoints(line)}
            stroke={gapColor}
            strokeWidth={1.5}
            listening={false}
          />
        ) : (
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
        )
      )}
    </>
  );
}

export const SnapGuidelines = memo(SnapGuidelinesInner);
