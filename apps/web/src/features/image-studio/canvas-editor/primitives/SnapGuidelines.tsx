/**
 * SnapGuidelines - Visual guidelines shown when elements snap to center or other elements
 */

import { memo } from 'react';
import { Line } from 'react-konva';

import type { SnapLine } from '../utils/snapping';

export interface SnapGuidelinesProps {
  showH?: boolean;
  showV?: boolean;
  stageWidth: number;
  stageHeight: number;
  color?: string;
  snapLines?: SnapLine[];
}

function SnapGuidelinesInner({
  showH = false,
  showV = false,
  stageWidth,
  stageHeight,
  color = '#0066ff',
  snapLines = [],
}: SnapGuidelinesProps) {
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
      {snapLines.map((line, index) => (
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

// Custom comparison for snapLines array - compare by content, not reference
function areSnapLinesEqual(prev: SnapLine[] = [], next: SnapLine[] = []): boolean {
  if (prev.length !== next.length) return false;
  return prev.every((line, i) => {
    const other = next[i];
    return (
      line.orientation === other.orientation &&
      line.position === other.position &&
      line.start === other.start &&
      line.end === other.end
    );
  });
}

// Memoize with custom comparison for snapLines array
export const SnapGuidelines = memo(SnapGuidelinesInner, (prev, next) => {
  if (prev.showH !== next.showH) return false;
  if (prev.showV !== next.showV) return false;
  if (prev.stageWidth !== next.stageWidth) return false;
  if (prev.stageHeight !== next.stageHeight) return false;
  if (prev.color !== next.color) return false;
  return areSnapLinesEqual(prev.snapLines, next.snapLines);
});
