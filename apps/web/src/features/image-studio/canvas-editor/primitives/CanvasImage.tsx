/**
 * CanvasImage - Draggable, transformable image layer
 *
 * Follows Konva best practices:
 * - Visual scaling during transform (no React state)
 * - Commit dimensions on transformEnd
 * - Snapping to other elements and stage center
 */

import { useRef, useEffect, useCallback, memo } from 'react';
import { Image as KonvaImage, Transformer } from 'react-konva';
import type Konva from 'konva';
import type { TransformConfig, TransformAnchor } from '@gruenerator/shared/canvas-editor';
import { calculateSnapPosition, calculateElementSnapPosition } from '../utils/snapping';
import type { SnapTarget, SnapLine } from '../utils/snapping';

export interface CanvasImageProps {
  id?: string;
  image: HTMLImageElement | null | undefined;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity?: number;
  draggable?: boolean;
  selected?: boolean;
  transformConfig?: Partial<TransformConfig>;
  onSelect?: () => void;
  onDeselect?: () => void;
  onDragEnd?: (x: number, y: number) => void;
  onTransformEnd?: (x: number, y: number, width: number, height: number) => void;
  snapToCenter?: boolean;
  stageWidth?: number;
  stageHeight?: number;
  onSnapChange?: (snapH: boolean, snapV: boolean) => void;
  snapTargets?: SnapTarget[];
  onPositionChange?: (id: string, x: number, y: number, width: number, height: number) => void;
  onSnapLinesChange?: (lines: SnapLine[]) => void;
}

const DEFAULT_IMAGE_ANCHORS: TransformAnchor[] = [
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
];

function CanvasImageInner({
  id,
  image,
  x,
  y,
  width,
  height,
  opacity = 1,
  draggable = true,
  selected = false,
  transformConfig,
  onSelect,
  onDeselect,
  onDragEnd,
  onTransformEnd,
  snapToCenter = false,
  stageWidth,
  stageHeight,
  onSnapChange,
  snapTargets,
  onPositionChange,
  onSnapLinesChange,
}: CanvasImageProps) {
  const imageRef = useRef<Konva.Image>(null);
  const trRef = useRef<Konva.Transformer>(null);

  useEffect(() => {
    if (selected && trRef.current && imageRef.current) {
      trRef.current.nodes([imageRef.current]);
      trRef.current.getLayer()?.batchDraw();
    } else if (!selected && trRef.current) {
      trRef.current.nodes([]);
    }
  }, [selected]);

  const handleDragEnd = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      const node = e.target as Konva.Image;
      const nodeWidth = node.width() * node.scaleX();
      const nodeHeight = node.height() * node.scaleY();

      onSnapChange?.(false, false);
      onSnapLinesChange?.([]);
      onDragEnd?.(node.x(), node.y());

      if (id && onPositionChange) {
        onPositionChange(id, node.x(), node.y(), nodeWidth, nodeHeight);
      }
    },
    [id, onDragEnd, onSnapChange, onSnapLinesChange, onPositionChange]
  );

  const handleDragMove = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      const node = e.target as Konva.Image;
      const nodeWidth = node.width() * node.scaleX();
      const nodeHeight = node.height() * node.scaleY();

      if (!stageWidth || !stageHeight) return;

      if (snapTargets && snapTargets.length > 0) {
        const result = calculateElementSnapPosition(
          node.x(),
          node.y(),
          nodeWidth,
          nodeHeight,
          snapTargets,
          stageWidth,
          stageHeight
        );

        node.position({ x: result.x, y: result.y });
        onSnapChange?.(result.snapH, result.snapV);
        onSnapLinesChange?.(result.snapLines);
      } else if (snapToCenter) {
        const { x, y, snapH, snapV } = calculateSnapPosition(
          node.x(),
          node.y(),
          nodeWidth,
          nodeHeight,
          stageWidth,
          stageHeight
        );

        node.position({ x, y });
        onSnapChange?.(snapH, snapV);
      }
    },
    [snapToCenter, stageWidth, stageHeight, onSnapChange, snapTargets, onSnapLinesChange]
  );

  const handleTransform = useCallback(() => {
    // Visual scaling only during transform - no state updates
  }, []);

  const handleTransformEnd = useCallback(() => {
    const node = imageRef.current;
    if (!node) return;

    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    const currentWidth = node.width();
    const currentHeight = node.height();

    const SCALE_THRESHOLD = 0.03;
    const scaleChanged =
      Math.abs(scaleX - 1) > SCALE_THRESHOLD || Math.abs(scaleY - 1) > SCALE_THRESHOLD;

    if (scaleChanged) {
      const newWidth = Math.round(currentWidth * scaleX);
      const newHeight = Math.round(currentHeight * scaleY);

      node.scale({ x: 1, y: 1 });
      node.width(newWidth);
      node.height(newHeight);

      onTransformEnd?.(node.x(), node.y(), newWidth, newHeight);
    } else {
      node.scale({ x: 1, y: 1 });
      onTransformEnd?.(node.x(), node.y(), currentWidth, currentHeight);
    }
  }, [onTransformEnd]);

  if (!image) return null;

  const enabledAnchors = transformConfig?.enabledAnchors ?? DEFAULT_IMAGE_ANCHORS;

  return (
    <>
      <KonvaImage
        ref={imageRef}
        id={id}
        image={image}
        x={x}
        y={y}
        width={width}
        height={height}
        opacity={opacity}
        draggable={draggable}
        onClick={onSelect}
        onTap={onSelect}
        onDragEnd={handleDragEnd}
        onDragMove={handleDragMove}
        onTransform={handleTransform}
        onTransformEnd={handleTransformEnd}
      />
      {selected && (
        <Transformer
          ref={trRef}
          rotateEnabled={transformConfig?.rotateEnabled ?? false}
          flipEnabled={transformConfig?.flipEnabled ?? false}
          keepRatio={transformConfig?.keepRatio ?? true}
          enabledAnchors={enabledAnchors}
          boundBoxFunc={(oldBox, newBox) => {
            const minWidth = transformConfig?.bounds?.minWidth ?? 20;
            const maxWidth = transformConfig?.bounds?.maxWidth ?? Infinity;
            if (newBox.width < minWidth) return oldBox;
            if (newBox.width > maxWidth) return oldBox;
            return newBox;
          }}
        />
      )}
    </>
  );
}

export const CanvasImage = memo(CanvasImageInner, (prevProps, nextProps) => {
  const keysToCompare: (keyof CanvasImageProps)[] = [
    'id',
    'x',
    'y',
    'width',
    'height',
    'opacity',
    'draggable',
    'selected',
    'stageWidth',
    'stageHeight',
    'snapToCenter',
  ];

  for (const key of keysToCompare) {
    if (prevProps[key] !== nextProps[key]) {
      return false;
    }
  }

  // Compare image reference
  if (prevProps.image !== nextProps.image) {
    return false;
  }

  return true;
});
