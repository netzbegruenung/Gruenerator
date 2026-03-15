/* eslint-disable react-hooks/refs */
import { memo } from 'react';

import type { RemoteCursor } from '../hooks/useBoardAwareness';

import { Cursor, CursorBody, CursorName, CursorPointer } from '@/components/kibo-ui/cursor';

interface BoardCursorLayerProps {
  cursors: RemoteCursor[];
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export const BoardCursorLayer = memo(function BoardCursorLayer({
  cursors,
  containerRef,
}: BoardCursorLayerProps) {
  const container = containerRef.current;
  if (!container) return null;

  return (
    <div
      className="absolute top-0 left-0 pointer-events-none z-50"
      style={{
        width: container.scrollWidth,
        height: container.scrollHeight,
      }}
    >
      {cursors.map((cursor) => {
        const left = (cursor.x / 100) * container.scrollWidth;
        const top = (cursor.y / 100) * container.scrollHeight;

        return (
          <Cursor
            key={cursor.clientId}
            className="absolute"
            style={{
              left,
              top,
              transition: 'left 100ms linear, top 100ms linear',
            }}
          >
            <CursorPointer style={{ color: cursor.user.color }} />
            <CursorBody
              style={{ backgroundColor: cursor.user.color + '20', color: cursor.user.color }}
            >
              <CursorName>{cursor.user.name}</CursorName>
            </CursorBody>
          </Cursor>
        );
      })}
    </div>
  );
});
