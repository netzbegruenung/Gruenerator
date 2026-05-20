/**
 * SnapGuidelines - Visual guidelines shown when elements snap to center or other elements
 *
 * Subscribes to snap state directly from the store to avoid re-rendering
 * the parent GenericCanvas on every snap line change during drag.
 */

import { memo } from 'react';
import { Line } from 'react-konva';

import { useCanvasStoreShallow } from '../stores/CanvasStoreProvider';

import type { SnapLine } from '../utils/snapping';

export interface SnapGuidelinesProps {
  stageWidth: number;
  stageHeight: number;
  color?: string;
}

function SnapGuidelinesInner({ stageWidth, stageHeight, color = '#0066ff' }: SnapGuidelinesProps) {
  const { h: showH, v: showV } = useCanvasStoreShallow((s) => s.snapGuides);
  const snapLines = useCanvasStoreShallow((s) => s.snapLines);

  const hasLines = showH || showV || snapLines.length > 0;
  if (!hasLines) return null;

  return (
    <>
      {showH && (
        <Line
          points={[stageWidth / 2, 0, stageWidth / 2, stageHeight]}
          stroke={color}
          strokeWidth={1}
          dash={[4, 4]}
          listening={false}
        />
      )}
      {showV && (
        <Line
          points={[0, stageHeight / 2, stageWidth, stageHeight / 2]}
          stroke={color}
          strokeWidth={1}
          dash={[4, 4]}
          listening={false}
        />
      )}
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
