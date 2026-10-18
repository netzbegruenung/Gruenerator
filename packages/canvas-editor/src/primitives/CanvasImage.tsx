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

import Konva from 'konva';
import { useRef, useEffect, useCallback, memo } from 'react';
import { Image as KonvaImage, Transformer } from 'react-konva';

import { LOCKED_TRANSFORMER, useIsItemLocked } from '../components/canvasItemLock';
import { useGeometryReporter, type GeometryReporter } from '../hooks/useGeometryReporter';
import { useSnapScheduler } from '../hooks/useSnapScheduler';
import { panWindowPhoto, zoomWindow, type Rect } from '../utils/coverFit';
import { getActiveImageFilters, imageFilterAttrs } from '../utils/imageFilters';
import { isGroupDrag } from '../utils/multiSelect';
import { recacheNextFrame } from '../utils/recacheNextFrame';
import { calculateElementSnapPosition } from '../utils/snapping';
import { touchAnchorStyleFunc } from '../utils/touchInput';

import type { SnapTarget, SnapLine } from '../utils/snapping';
import type { ImageAdjustments } from '../utils/userImageUtils';
import type { TransformConfig, TransformAnchor } from '@gruenerator/shared/canvas-editor';

export interface CanvasImageProps {
  id?: string;
  image: HTMLImageElement | null | undefined;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity?: number;
  draggable?: boolean;
  /** Touch moves the image only if it was already selected when the finger went down. */
  touchDragNeedsSelection?: boolean;
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
  getSnapTargets?: (excludeId: string) => SnapTarget[];
  onPositionChange?: (id: string, x: number, y: number, width: number, height: number) => void;
  /** Meldet die gerenderte Geometrie als Snap-Ziel — unabhaengig davon, ob je gezogen wurde. */
  onGeometryChange?: GeometryReporter;
  onSnapLinesChange?: (lines: SnapLine[]) => void;
  listening?: boolean;
  color?: string;
  constrainToBounds?: boolean;
  /** The "Bearbeiten" look (filters, vignette, flip); same fields as a free image. */
  adjustments?: ImageAdjustments | null;
  /**
   * Cover-fitted background: x/y/width/height is a window of the frame's
   * aspect onto the photo's centre; the whole photo extends around it, and
   * only the part inside `frame` is drawn. Dragging pans the photo inside the
   * frame without ever opening a gap.
   */
  coverFit?: boolean;
  /** The slot a cover-fitted photo fills (the element's unzoomed box); defaults to the stage. */
  frame?: Rect | null;
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
  touchDragNeedsSelection = false,
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
  getSnapTargets,
  onPositionChange,
  onGeometryChange,
  onSnapLinesChange,
  listening,
  color,
  constrainToBounds = true,
  adjustments,
  coverFit = false,
  frame,
}: CanvasImageProps) {
  const locked = useIsItemLocked();
  const imageRef = useRef<Konva.Image>(null);
  // Drag of a cover-fitted photo: the node under the pointer at drag start, and the pan so far.
  const panStartRef = useRef<{ part: Rect; dx: number; dy: number } | null>(null);
  const adjustmentFilters = adjustments ? getActiveImageFilters(adjustments) : [];
  const trRef = useRef<Konva.Transformer>(null);

  const snap = useSnapScheduler({
    onSnapChange: onSnapChange ?? (() => {}),
    onSnapLinesChange: onSnapLinesChange ?? (() => {}),
  });

  const natural =
    coverFit && image && image.naturalWidth > 0 && image.naturalHeight > 0
      ? { width: image.naturalWidth, height: image.naturalHeight }
      : null;
  const slot: Rect | null =
    natural && width > 0 && height > 0
      ? (frame ?? { x: 0, y: 0, width: stageWidth ?? width, height: stageHeight ?? height })
      : null;
  const mirror =
    adjustments?.flipX || adjustments?.flipY
      ? { x: !!adjustments.flipX, y: !!adjustments.flipY }
      : null;
  const part =
    natural && slot
      ? panWindowPhoto(natural, { x, y, width, height }, slot, 0, 0, mirror).part
      : null;

  useEffect(() => {
    if (selected && trRef.current && imageRef.current) {
      trRef.current.nodes([imageRef.current]);
      trRef.current.getLayer()?.batchDraw();
    } else if (!selected && trRef.current) {
      trRef.current.nodes([]);
    }
  }, [selected]);

  // Konva filters require the node to be cached first; without filters the
  // cache is only an extra offscreen canvas redrawn on every change.
  useEffect(() => {
    const node = imageRef.current;
    if (!node || !image) return;
    if (color || adjustmentFilters.length > 0) {
      node.cache();
    } else {
      node.clearCache();
    }
    node.getLayer()?.batchDraw();
  }, [
    image,
    width,
    height,
    part?.crop.x,
    part?.crop.y,
    color,
    adjustments,
    adjustmentFilters.length,
  ]);

  const handleTouchStart = useCallback(
    (e: Konva.KonvaEventObject<TouchEvent>) => {
      const node = e.target;
      if (touchDragNeedsSelection && !selected && draggable) {
        node.draggable(false);
        node.stopDrag();
        const restore = () => {
          window.removeEventListener('touchend', restore);
          window.removeEventListener('touchcancel', restore);
          node.draggable(draggable);
        };
        window.addEventListener('touchend', restore);
        window.addEventListener('touchcancel', restore);
      }
      onSelect?.();
    },
    [touchDragNeedsSelection, selected, draggable, onSelect]
  );

  const reportGeometry = useGeometryReporter(id, onGeometryChange);

  const drawn = part?.box ?? { x, y, width, height };
  useEffect(() => {
    reportGeometry(drawn.x, drawn.y, drawn.width, drawn.height);
  }, [reportGeometry, drawn.x, drawn.y, drawn.width, drawn.height]);

  const handleDragEnd = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      const node = e.target as Konva.Image;
      const nodeWidth = node.width() * node.scaleX();
      const nodeHeight = node.height() * node.scaleY();

      snap.onDragEnd();
      const pan = panStartRef.current;
      if (pan) {
        // The window moves with the photo; the store keeps the window.
        panStartRef.current = null;
        onDragEnd?.(x + pan.dx, y + pan.dy);
        return;
      }
      if (part) {
        // Moved along in a group drag: the window travels as far as the node.
        onDragEnd?.(x + node.x() - part.box.x, y + node.y() - part.box.y);
        return;
      }
      onDragEnd?.(node.x(), node.y());

      if (id && onPositionChange) {
        onPositionChange(id, node.x(), node.y(), nodeWidth, nodeHeight);
      }
    },
    [id, x, y, part, onDragEnd, onPositionChange, snap]
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

  const handleDragMove = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      const node = e.target as Konva.Image;
      if (isGroupDrag(node)) return;
      const pan = panStartRef.current;
      if (pan && natural && slot) {
        // The node stays the visible part; the photo moves under it.
        const next = panWindowPhoto(
          natural,
          { x, y, width, height },
          slot,
          node.x() - pan.part.x,
          node.y() - pan.part.y,
          mirror
        );
        if (!next.part) return;
        node.position(next.part.box);
        node.size(next.part.box);
        node.crop(next.part.crop);
        pan.dx = next.dx;
        pan.dy = next.dy;
        recacheNextFrame(node);
        return;
      }
      const nodeWidth = node.width() * node.scaleX();
      const nodeHeight = node.height() * node.scaleY();

      if (!stageWidth || !stageHeight) return;

      let finalX = node.x();
      let finalY = node.y();
      let snapH = false;
      let snapV = false;
      let snapLines: SnapLine[] = [];

      // Apply snapping if enabled
      const snapTargets = getSnapTargets?.(id ?? '') ?? [];
      if (snapTargets.length > 0 || snapToCenter) {
        const result = calculateElementSnapPosition(
          node.x(),
          node.y(),
          nodeWidth,
          nodeHeight,
          snapTargets,
          stageWidth,
          stageHeight,
          snap.hysteresis
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
      snap.scheduleSnap(snapH, snapV, snapLines);
    },
    [
      id,
      snapToCenter,
      stageWidth,
      stageHeight,
      getSnapTargets,
      clampToBounds,
      snap,
      natural,
      slot,
      mirror,
      x,
      y,
      width,
      height,
    ]
  );

  const handleDragStart = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      // In a group drag the photo moves with the others, as any element does.
      panStartRef.current =
        part && !isGroupDrag(e.target) ? { part: part.box, dx: 0, dy: 0 } : null;
      snap.onDragStart();
    },
    [part, snap]
  );

  const handleTransform = useCallback(() => {
    // Visual scaling only during transform - no state updates
  }, []);

  const handleTransformEnd = useCallback(() => {
    const node = imageRef.current;
    if (!node) return;

    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    if (slot && part) {
      // The handles sit on the visible part; they zoom the photo about its middle.
      node.scale({ x: 1, y: 1 });
      const zoomed = zoomWindow({ x, y, width, height }, scaleX, slot);
      onTransformEnd?.(zoomed.x, zoomed.y, zoomed.width, zoomed.height);
      return;
    }
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
  }, [onTransformEnd, slot, part, x, y, width, height]);

  // Performance: dragBoundFunc now just returns position - actual clamping happens in handleDragMove
  // This avoids double calculation of bounds on every mouse move
  const dragBoundFunc = useCallback((pos: { x: number; y: number }) => {
    // Return position as-is; handleDragMove will apply bounds + snapping
    // This removes the duplicate clampToBounds call that was causing performance issues
    return pos;
  }, []);

  if (!image) return null;

  const enabledAnchors = transformConfig?.enabledAnchors ?? DEFAULT_IMAGE_ANCHORS;

  return (
    <>
      <KonvaImage
        ref={imageRef}
        id={id}
        image={image}
        x={part?.box.x ?? x}
        y={part?.box.y ?? y}
        width={part?.box.width ?? width}
        height={part?.box.height ?? height}
        crop={part?.crop}
        opacity={opacity}
        draggable={draggable && !locked}
        dragBoundFunc={dragBoundFunc}
        onMouseDown={onSelect}
        onTouchStart={handleTouchStart}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragMove={handleDragMove}
        onTransform={handleTransform}
        onTransformEnd={handleTransformEnd}
        listening={listening}
        filters={color ? [Konva.Filters.RGB, ...adjustmentFilters] : adjustmentFilters}
        red={color ? parseInt(color.slice(1, 3), 16) : undefined}
        green={color ? parseInt(color.slice(3, 5), 16) : undefined}
        blue={color ? parseInt(color.slice(5, 7), 16) : undefined}
        {...(adjustments ? imageFilterAttrs(adjustments) : {})}
      />
      {selected && (
        <Transformer
          anchorStyleFunc={touchAnchorStyleFunc}
          ref={trRef}
          rotateEnabled={transformConfig?.rotateEnabled ?? false}
          rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
          rotationSnapTolerance={7}
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
          {...(locked ? LOCKED_TRANSFORMER : {})}
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
    'touchDragNeedsSelection',
    'selected',
    'stageWidth',
    'stageHeight',
    'snapToCenter',
    'listening',
    'constrainToBounds',
    'color',
    'adjustments',
    'coverFit',
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

  const a = prevProps.frame;
  const b = nextProps.frame;
  if (
    a !== b &&
    (!a || !b || a.x !== b.x || a.y !== b.y || a.width !== b.width || a.height !== b.height)
  ) {
    return false;
  }

  // Note: We intentionally DO NOT compare callback functions (onSnapChange, onSnapLinesChange, etc.)
  // These are expected to be stable references from useCallback in parent components.
  // Comparing them would cause unnecessary re-renders since callback identity can change
  // even when the actual function behavior is the same.

  return true;
});
