import React, { useEffect, useRef, useState } from 'react';
import { Group, Label, Rect, Tag, Text } from 'react-konva';

import type Konva from 'konva';

export interface RemoteSelector {
  userName: string;
  color: string;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Draws a colored dashed outline + name chip around an element that a remote
 * collaborator currently has selected. The child renders inside an
 * identity-transform Group that is measured after each commit, so the outline
 * tracks remote drags/transforms (they arrive as Yjs -> state -> re-render).
 */
export function RemoteSelectionOverlay({
  selector,
  children,
}: {
  selector: RemoteSelector;
  children: React.ReactNode;
}) {
  const groupRef = useRef<Konva.Group>(null);
  const [box, setBox] = useState<Box | null>(null);

  useEffect(() => {
    const node = groupRef.current;
    const parent = node?.getParent();
    if (!node || !parent) return;
    const rect = node.getClientRect({ relativeTo: parent as Konva.Container });
    setBox((prev) =>
      prev &&
      prev.x === rect.x &&
      prev.y === rect.y &&
      prev.width === rect.width &&
      prev.height === rect.height
        ? prev
        : rect
    );
  });

  return (
    <Group>
      <Group ref={groupRef}>{children}</Group>
      {box && box.width > 0 && box.height > 0 && (
        <>
          <Rect
            x={box.x}
            y={box.y}
            width={box.width}
            height={box.height}
            stroke={selector.color}
            strokeWidth={2}
            strokeScaleEnabled={false}
            dash={[6, 4]}
            listening={false}
          />
          <Label x={box.x} y={box.y - 34} listening={false}>
            <Tag fill={selector.color} cornerRadius={4} />
            <Text text={selector.userName} fontSize={22} fill="#ffffff" padding={6} />
          </Label>
        </>
      )}
    </Group>
  );
}
