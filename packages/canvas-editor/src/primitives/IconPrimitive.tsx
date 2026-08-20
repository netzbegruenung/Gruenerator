import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { Image, Group, Rect, Transformer } from 'react-konva';

import type Konva from 'konva';

import { useGeometryReporter, type GeometryReporter } from '../hooks/useGeometryReporter';
import { useSnapScheduler } from '../hooks/useSnapScheduler';
import { generateIconDataUrl } from '../utils/canvasIcons';
import { calculateCenteredSnapPosition } from '../utils/snapping';

import type { SnapLine, SnapTarget } from '../utils/snapping';

const BASE_SIZE = 200;
const TARGET_SIZE = 120;

export interface IconPrimitiveProps {
  id: string;
  icon: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  selected: boolean;
  onSelect: () => void;
  onDragEnd: (x: number, y: number) => void;
  onTransformEnd: (x: number, y: number, scale: number, rotation: number) => void;
  color?: string;
  opacity?: number;
  stageWidth?: number;
  stageHeight?: number;
  getSnapTargets?: (id: string) => SnapTarget[];
  onSnapChange?: (snapH: boolean, snapV: boolean) => void;
  onSnapLinesChange?: (lines: SnapLine[]) => void;
  onGeometryChange?: GeometryReporter;
}

function IconPrimitiveInner({
  id,
  icon,
  x,
  y,
  scale,
  rotation,
  selected,
  onSelect,
  onDragEnd,
  onTransformEnd,
  color = '#000000',
  opacity = 1,
  stageWidth,
  stageHeight,
  getSnapTargets,
  onSnapChange,
  onSnapLinesChange,
  onGeometryChange,
}: IconPrimitiveProps) {
  const groupRef = useRef<Konva.Group>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const size = 200;

    generateIconDataUrl(icon, size, color).then((dataUrl) => {
      if (cancelled || !dataUrl) return;
      const img = new window.Image();
      img.src = dataUrl;
      img.onload = () => {
        if (!cancelled) setImage(img);
      };
    });

    return () => {
      cancelled = true;
    };
  }, [icon, color]);

  useEffect(() => {
    if (selected && transformerRef.current && groupRef.current) {
      transformerRef.current.nodes([groupRef.current]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [selected]);

  const snap = useSnapScheduler({
    onSnapChange: onSnapChange ?? (() => {}),
    onSnapLinesChange: onSnapLinesChange ?? (() => {}),
  });

  // Die Gruppe ist mittig verankert (das Bild traegt offsetX/offsetY), deshalb
  // rechnet der Snap zwischen Mittelpunkt und linker oberer Ecke hin und zurueck.
  const renderedSize = TARGET_SIZE * scale;

  const reportGeometry = useGeometryReporter(id, onGeometryChange);
  useEffect(() => {
    reportGeometry(x - renderedSize / 2, y - renderedSize / 2, renderedSize, renderedSize);
  }, [reportGeometry, x, y, renderedSize]);

  const handleDragMove = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      if (!stageWidth || !stageHeight) return;
      const node = e.target as Konva.Group;
      const size = TARGET_SIZE * scale;

      const result = calculateCenteredSnapPosition(
        node.x(),
        node.y(),
        size,
        size,
        getSnapTargets?.(id) ?? [],
        stageWidth,
        stageHeight,
        snap.hysteresis
      );

      node.position({ x: result.x, y: result.y });
      snap.scheduleSnap(result.snapH, result.snapV, result.snapLines);
    },
    [id, scale, getSnapTargets, stageWidth, stageHeight, snap]
  );

  const handleDragEnd = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      snap.onDragEnd();
      onDragEnd(e.target.x(), e.target.y());
    },
    [onDragEnd, snap]
  );

  if (!image) return null;

  const baseScale = TARGET_SIZE / BASE_SIZE;

  return (
    <>
      <Group
        ref={groupRef}
        x={x}
        y={y}
        scaleX={scale * baseScale}
        scaleY={scale * baseScale}
        rotation={rotation}
        opacity={opacity}
        draggable
        onClick={onSelect}
        onTap={onSelect}
        onDragStart={snap.onDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        onTransformEnd={() => {
          const node = groupRef.current;
          if (!node) return;

          const scaleX = node.scaleX();
          const scaleY = node.scaleY();
          const newScale = Math.max(scaleX, scaleY) / baseScale;
          const newRotation = node.rotation();

          node.scaleX(scale * baseScale);
          node.scaleY(scale * baseScale);
          node.rotation(rotation);

          onTransformEnd(node.x(), node.y(), newScale, newRotation);
        }}
      >
        <Image
          image={image}
          width={BASE_SIZE}
          height={BASE_SIZE}
          offsetX={BASE_SIZE / 2}
          offsetY={BASE_SIZE / 2}
        />

        {selected && (
          <Rect
            name="selection-chrome"
            x={-BASE_SIZE / 2}
            y={-BASE_SIZE / 2}
            width={BASE_SIZE}
            height={BASE_SIZE}
            stroke="#0066ff"
            strokeWidth={2 / (scale * baseScale)}
            dash={[5, 5]}
            listening={false}
          />
        )}
      </Group>

      {selected && (
        <Transformer
          ref={transformerRef}
          keepRatio={true}
          enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
        />
      )}
    </>
  );
}

export const IconPrimitive = memo(IconPrimitiveInner, (prevProps, nextProps) => {
  if (prevProps.id !== nextProps.id) return false;
  if (prevProps.icon !== nextProps.icon) return false;
  if (prevProps.x !== nextProps.x) return false;
  if (prevProps.y !== nextProps.y) return false;
  if (prevProps.scale !== nextProps.scale) return false;
  if (prevProps.rotation !== nextProps.rotation) return false;
  if (prevProps.selected !== nextProps.selected) return false;
  if (prevProps.color !== nextProps.color) return false;
  if (prevProps.opacity !== nextProps.opacity) return false;
  // Die Buehnenmasse gehen in die Snap-Rechnung ein (Formatwechsel).
  if (prevProps.stageWidth !== nextProps.stageWidth) return false;
  if (prevProps.stageHeight !== nextProps.stageHeight) return false;

  return true;
});

IconPrimitive.displayName = 'IconPrimitive';
