/**
 * CanvasImage - Draggable, transformable image layer
 *
 * Follows Konva best practices:
 * - Visual scaling during transform (no React state)
 * - Commit dimensions on transformEnd
 * - Snapping to other elements and stage center
 *
 * Performance optimizations:
 * - Uses refs for snap state during drag to avoid React re-renders
 * - Throttled snap line updates via requestAnimationFrame
 * - Single bounds calculation (removed from dragBoundFunc, only in handleDragMove)
 */

import { useRef, useEffect, useCallback, memo } from 'react';
import { Image as KonvaImage, Transformer } from 'react-konva';
import Konva from 'konva';
import type { TransformConfig, TransformAnchor } from '@gruenerator/shared/canvas-editor';
import { calculateElementSnapPosition } from '../utils/snapping';
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
  listening?: boolean;
  color?: string;
  constrainToBounds?: boolean;
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
  snapToCenter = true,
  stageWidth,
  stageHeight,
  onSnapChange,
  snapTargets,
  onPositionChange,
  onSnapLinesChange,
  listening,
  color,
  constrainToBounds = true,
}: CanvasImageProps) {
  const imageRef = useRef<Konva.Image>(null);
  const trRef = useRef<Konva.Transformer>(null);

  // Performance: Track snap state in refs during drag to avoid React re-renders
  const isDraggingRef = useRef(false);
  const lastSnapStateRef = useRef({ snapH: false, snapV: false });
  const lastSnapLinesRef = useRef<SnapLine[]>([]);
  const rafIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (selected && trRef.current && imageRef.current) {
      trRef.current.nodes([imageRef.current]);
      trRef.current.getLayer()?.batchDraw();
    } else if (!selected && trRef.current) {
      trRef.current.nodes([]);
    }
  }, [selected]);

  useEffect(() => {
    if (imageRef.current && image) {
      // Small timeout to ensure image is ready or just cache
      imageRef.current.cache();
    }
  }, [image, width, height, color]);

  // Handler for drag start - set dragging flag
  const handleDragStart = useCallback(() => {
    isDraggingRef.current = true;
  }, []);

  const handleDragEnd = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      const node = e.target as Konva.Image;
      const nodeWidth = node.width() * node.scaleX();
      const nodeHeight = node.height() * node.scaleY();

      // Cancel any pending RAF
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }

      isDraggingRef.current = false;

      // Clear snap state at end of drag
      onSnapChange?.(false, false);
      onSnapLinesChange?.([]);
      lastSnapStateRef.current = { snapH: false, snapV: false };
      lastSnapLinesRef.current = [];

      onDragEnd?.(node.x(), node.y());

      if (id && onPositionChange) {
        onPositionChange(id, node.x(), node.y(), nodeWidth, nodeHeight);
      }
    },
    [id, onDragEnd, onSnapChange, onSnapLinesChange, onPositionChange]
  );

  const clampToBounds = useCallback(
    (posX: number, posY: number, nodeWidth: number, nodeHeight: number) => {
      if (!constrainToBounds || !stageWidth || !stageHeight) {
        return { x: posX, y: posY };
      }

      let minX: number, maxX: number, minY: number, maxY: number;

      if (nodeWidth >= stageWidth) {
        // Image is wider or equal: must cover canvas horizontally
        // Can pan within overflow, right edge must always reach canvas right edge
        minX = stageWidth - nodeWidth; // Negative or zero
        maxX = 0;
      } else {
        // Image is narrower: keep within canvas bounds
        minX = 0;
        maxX = stageWidth - nodeWidth;
      }

      if (nodeHeight >= stageHeight) {
        // Image is taller or equal: must cover canvas vertically
        minY = stageHeight - nodeHeight; // Negative or zero
        maxY = 0;
      } else {
        // Image is shorter: keep within canvas bounds
        minY = 0;
        maxY = stageHeight - nodeHeight;
      }

      return {
        x: Math.max(minX, Math.min(posX, maxX)),
        y: Math.max(minY, Math.min(posY, maxY)),
      };
    },
    [constrainToBounds, stageWidth, stageHeight]
  );

  // Performance: Schedule React state updates via RAF to batch them
  const scheduleSnapUpdate = useCallback(
    (snapH: boolean, snapV: boolean, snapLines: SnapLine[]) => {
      // Only update if snap state actually changed
      const lastSnap = lastSnapStateRef.current;
      const snapChanged = lastSnap.snapH !== snapH || lastSnap.snapV !== snapV;
      const linesChanged = snapLines.length !== lastSnapLinesRef.current.length;

      if (!snapChanged && !linesChanged) return;

      lastSnapStateRef.current = { snapH, snapV };
      lastSnapLinesRef.current = snapLines;

      // Cancel previous RAF if pending
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }

      // Schedule update for next frame
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;
        if (isDraggingRef.current) {
          onSnapChange?.(snapH, snapV);
          onSnapLinesChange?.(snapLines);
        }
      });
    },
    [onSnapChange, onSnapLinesChange]
  );

  const handleDragMove = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      const node = e.target as Konva.Image;
      const nodeWidth = node.width() * node.scaleX();
      const nodeHeight = node.height() * node.scaleY();

      if (!stageWidth || !stageHeight) return;

      let finalX = node.x();
      let finalY = node.y();
      let snapH = false;
      let snapV = false;
      let snapLines: SnapLine[] = [];

      // Apply snapping if enabled
      if ((snapTargets && snapTargets.length > 0) || snapToCenter) {
        const result = calculateElementSnapPosition(
          node.x(),
          node.y(),
          nodeWidth,
          nodeHeight,
          snapTargets || [],
          stageWidth,
          stageHeight
        );
        finalX = result.x;
        finalY = result.y;
        snapH = result.snapH;
        snapV = result.snapV;
        snapLines = result.snapLines;
      }

      // Apply bounds constraint AFTER snapping
      const bounded = clampToBounds(finalX, finalY, nodeWidth, nodeHeight);

      // Update Konva node position directly (no React state)
      node.position({ x: bounded.x, y: bounded.y });

      // Schedule snap state updates via RAF (throttled, batched)
      scheduleSnapUpdate(snapH, snapV, snapLines);
    },
    [snapToCenter, stageWidth, stageHeight, snapTargets, clampToBounds, scheduleSnapUpdate]
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

  // Performance: dragBoundFunc now just returns position - actual clamping happens in handleDragMove
  // This avoids double calculation of bounds on every mouse move
  const dragBoundFunc = useCallback(
    (pos: { x: number; y: number }) => {
      // Return position as-is; handleDragMove will apply bounds + snapping
      // This removes the duplicate clampToBounds call that was causing performance issues
      return pos;
    },
    []
  );

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
        dragBoundFunc={dragBoundFunc}
        onClick={onSelect}
        onTap={onSelect}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragMove={handleDragMove}
        onTransform={handleTransform}
        onTransformEnd={handleTransformEnd}
        listening={listening}
        filters={color ? [Konva.Filters.RGB] : []}
        red={color ? parseInt(color.slice(1, 3), 16) : undefined}
        green={color ? parseInt(color.slice(3, 5), 16) : undefined}
        blue={color ? parseInt(color.slice(5, 7), 16) : undefined}
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
  // Compare primitive props that affect rendering
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
    'listening',
    'constrainToBounds',
    'color', // Include color for RGB filter changes
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

  // Note: We intentionally DO NOT compare callback functions (onSnapChange, onSnapLinesChange, etc.)
  // These are expected to be stable references from useCallback in parent components.
  // Comparing them would cause unnecessary re-renders since callback identity can change
  // even when the actual function behavior is the same.

  // We also don't compare snapTargets array - it changes during drag but doesn't affect
  // the visual rendering of this component (only used in event handlers)

  return true;
});
