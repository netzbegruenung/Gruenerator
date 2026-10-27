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
import { useRef, useEffect, useCallback, useMemo, memo } from 'react';
import { Image as KonvaImage, Transformer } from 'react-konva';

import { LOCKED_TRANSFORMER, useIsItemLocked } from '../components/canvasItemLock';
import { useGeometryReporter, type GeometryReporter } from '../hooks/useGeometryReporter';
import { useSnapScheduler } from '../hooks/useSnapScheduler';
import {
  panWindowPhoto,
  photoRectAround,
  visiblePart,
  windowInPhoto,
  zoomWindow,
  type Rect,
} from '../utils/coverFit';
import {
  CROP_GHOST_NAME,
  CROP_GHOST_OPACITY,
  cropGhostAttrs,
  cropGhostSource,
  placeCropGhost,
} from '../utils/cropGhost';
import { getActiveImageFilters, imageFilterAttrs } from '../utils/imageFilters';
import { backgroundKeyCrop, cropKeyOf, type CropKey } from '../utils/keyboardCrop';
import { isGroupDrag } from '../utils/multiSelect';
import { ELEMENT_TRANSFORMER, normalizeRotation } from '../utils/orientation';
import { recacheNextFrame } from '../utils/recacheNextFrame';
import { boxFrame, createBoxFrame, frameBounds, snapByBounds } from '../utils/snapping';
import {
  panStraightPhoto,
  STRAIGHT_DRAW_ATTR,
  straightDrawOf,
  straightenWindowPhoto,
  straightScaleCrop,
  straightSceneFunc,
  windowPhotoOfStraight,
  zoomStraightPhoto,
} from '../utils/straighten';

import type { SnapTarget, SnapLine } from '../utils/snapping';
import type { ImageAdjustments } from '../utils/userImageUtils';
import type { TransformConfig, TransformAnchor } from '../types/editorTypes';

// Rahmen für Snap und Geometrie-Meldung, pro Aufruf neu beschrieben (synchron, ohne Allokation).
const dragFrame = createBoxFrame();

export interface CanvasImageProps {
  id?: string;
  image: HTMLImageElement | null | undefined;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Degrees about the top-left origin; a cover-fitted photo never turns. */
  rotation?: number;
  opacity?: number;
  draggable?: boolean;
  /** Touch moves the image only if it was already selected when the finger went down. */
  touchDragNeedsSelection?: boolean;
  selected?: boolean;
  /** Doppelklick/Doppeltipp schaltet den Ausschnitt-Modus (nur das Hintergrundfoto). */
  onToggleCrop?: (() => void) | null;
  /** Ausschnitt-Modus: ein cover-gefittetes Foto zeigt sich ganz, außerhalb des Rahmens abgedunkelt. */
  cropping?: boolean;
  transformConfig?: Partial<TransformConfig>;
  onSelect?: () => void;
  onDeselect?: () => void;
  onDragEnd?: (x: number, y: number) => void;
  onTransformEnd?: (x: number, y: number, width: number, height: number, rotation: number) => void;
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
  /**
   * Begradigen eines cover-gefitteten Fotos, Grad. `null`: nie begradigt — der
   * alte Weg, unverändert. Gesetzt (auch 0) hält jede Lage auf Deckung.
   */
  straighten?: number | null;
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
  rotation = 0,
  opacity = 1,
  draggable = true,
  touchDragNeedsSelection = false,
  selected = false,
  onToggleCrop = null,
  cropping = false,
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
  straighten = null,
}: CanvasImageProps) {
  const locked = useIsItemLocked();
  const imageRef = useRef<Konva.Image>(null);
  // Drag of a cover-fitted photo: the node under the pointer at drag start, and the pan so far
  // (begradigt: die Lage des gedrehten Fotos).
  const panStartRef = useRef<{ part: Rect; dx: number; dy: number; photo: Rect | null } | null>(
    null
  );
  const adjustmentFilters = adjustments ? getActiveImageFilters(adjustments) : [];
  const trRef = useRef<Konva.Transformer>(null);
  const ghostRef = useRef<Konva.Image>(null);

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
  const deg = coverFit && natural && slot ? straighten : null;
  // Begradigt: das gedrehte Foto, auf Deckung gehalten; der Knoten ist der Rahmen.
  const straight =
    deg !== null && natural && slot
      ? straightenWindowPhoto(natural, photoRectAround(natural, { x, y, width, height }), deg, slot)
      : null;
  const turnDeg = straight !== null && deg !== null ? deg : 0;
  const turned = straight !== null && turnDeg !== 0;
  const part =
    natural && slot
      ? straight
        ? turned
          ? { box: slot, crop: straightScaleCrop(natural, straight, slot) }
          : visiblePart(natural, straight, slot, mirror)
        : panWindowPhoto(natural, { x, y, width, height }, slot, 0, 0, mirror).part
      : null;
  const draw = turned && straight && slot ? straightDrawOf(straight, turnDeg, slot, mirror) : null;
  const ghost =
    cropping && natural && part
      ? (straight ?? photoRectAround(natural, { x, y, width, height }))
      : null;
  // Begradigt dreht sich das Restbild samt gefilterter Kopie über `rotation` mit.
  const ghostAttrs = ghost ? cropGhostAttrs(ghost, mirror, turnDeg) : null;
  // Außerhalb des Rahmens dieselbe Bearbeitung wie innen (Weichzeichner, S/W …).
  const ghostWidth = ghost ? Math.round(ghost.width) : 0;
  const ghostImage = useMemo(
    () =>
      image && ghostWidth
        ? cropGhostSource(image, adjustments ?? null, ghostWidth, color ?? null)
        : null,
    [image, adjustments, color, ghostWidth]
  );

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
    draw?.x,
    draw?.y,
    draw?.width,
    draw?.rotation,
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
  const drawnRotation = coverFit ? 0 : rotation;
  useEffect(() => {
    const box = frameBounds(
      boxFrame(dragFrame, drawn.x, drawn.y, drawn.width, drawn.height, drawnRotation, 'top-left')
    );
    reportGeometry(box.x, box.y, box.width, box.height);
  }, [reportGeometry, drawn.x, drawn.y, drawn.width, drawn.height, drawnRotation]);

  const handleDragEnd = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      const node = e.target as Konva.Image;
      const nodeWidth = node.width() * node.scaleX();
      const nodeHeight = node.height() * node.scaleY();

      snap.onDragEnd();
      const pan = panStartRef.current;
      if (pan?.photo) {
        // Begradigt: das Fenster behält seine Größe, seine Mitte ist die des gedrehten Fotos.
        panStartRef.current = null;
        onDragEnd?.(
          pan.photo.x + pan.photo.width / 2 - width / 2,
          pan.photo.y + pan.photo.height / 2 - height / 2
        );
        return;
      }
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
        // onPositionChange schreibt die ungedrehte Box in dieselben Snap-Ziele;
        // gedreht muss danach die sichtbare Box dort stehen (der Reporter
        // meldet nur bei Prop-Änderung, ein Drag zurück an den Start ändert keine).
        if (node.rotation() !== 0 && onGeometryChange) {
          const box = frameBounds(
            boxFrame(
              dragFrame,
              node.x(),
              node.y(),
              nodeWidth,
              nodeHeight,
              node.rotation(),
              'top-left'
            )
          );
          onGeometryChange(id, box.x, box.y, box.width, box.height);
        }
      }
    },
    [id, x, y, width, height, part, onDragEnd, onPositionChange, onGeometryChange, snap]
  );

  const clampToBounds = useCallback(
    (posX: number, posY: number, nodeWidth: number, nodeHeight: number, nodeRotation: number) => {
      if (!constrainToBounds || !stageWidth || !stageHeight) {
        return { x: posX, y: posY };
      }

      // A turned image is kept in by its axis-aligned bounds; the shift of
      // that box is the shift of the node.
      const box = nodeRotation
        ? frameBounds(
            boxFrame(dragFrame, posX, posY, nodeWidth, nodeHeight, nodeRotation, 'top-left')
          )
        : { x: posX, y: posY, width: nodeWidth, height: nodeHeight };

      let minX: number, maxX: number, minY: number, maxY: number;

      if (box.width >= stageWidth) {
        // Image is wider or equal: must cover canvas horizontally
        // Can pan within overflow, right edge must always reach canvas right edge
        minX = stageWidth - box.width; // Negative or zero
        maxX = 0;
      } else {
        // Image is narrower: keep within canvas bounds
        minX = 0;
        maxX = stageWidth - box.width;
      }

      if (box.height >= stageHeight) {
        // Image is taller or equal: must cover canvas vertically
        minY = stageHeight - box.height; // Negative or zero
        maxY = 0;
      } else {
        // Image is shorter: keep within canvas bounds
        minY = 0;
        maxY = stageHeight - box.height;
      }

      return {
        x: posX + Math.max(minX, Math.min(box.x, maxX)) - box.x,
        y: posY + Math.max(minY, Math.min(box.y, maxY)) - box.y,
      };
    },
    [constrainToBounds, stageWidth, stageHeight]
  );

  const handleDragMove = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      const node = e.target as Konva.Image;
      if (isGroupDrag(node)) return;
      const pan = panStartRef.current;
      if (pan && straight && natural && slot) {
        // Der Knoten bleibt der Rahmen; das gedrehte Foto bewegt sich darin.
        const moved = panStraightPhoto(
          straight,
          turnDeg,
          slot,
          node.x() - pan.part.x,
          node.y() - pan.part.y
        );
        node.position(slot);
        if (turned) {
          node.setAttr(STRAIGHT_DRAW_ATTR, straightDrawOf(moved, turnDeg, slot, mirror));
        } else {
          const next = visiblePart(natural, moved, slot, mirror);
          if (next) node.crop(next.crop);
        }
        pan.photo = moved;
        placeCropGhost(ghostRef.current, moved, mirror, turnDeg);
        recacheNextFrame(node);
        return;
      }
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
        // Ziehen und Zoomen ändern die Knoten direkt; das Restbild geht ohne React-Zustand mit.
        placeCropGhost(
          ghostRef.current,
          photoRectAround(natural, { x: x + next.dx, y: y + next.dy, width, height }),
          mirror
        );
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
        const result = snapByBounds(
          boxFrame(
            dragFrame,
            node.x(),
            node.y(),
            nodeWidth,
            nodeHeight,
            node.rotation(),
            'top-left'
          ),
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
      const bounded = clampToBounds(finalX, finalY, nodeWidth, nodeHeight, node.rotation());

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
      straight,
      turned,
      turnDeg,
      x,
      y,
      width,
      height,
    ]
  );

  const handleDragStart = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      // In a group drag a cover-fitted image moves with the others; the background photo
      // never joins one, outside Ausschnitt mode it is not draggable.
      panStartRef.current =
        part && !isGroupDrag(e.target) ? { part: part.box, dx: 0, dy: 0, photo: null } : null;
      snap.onDragStart();
    },
    [part, snap]
  );

  // Tastatur im Ausschnitt-Modus: dieselben Grenzen und dieselbe Übernahme wie Ziehen und Zoomen.
  const keyCropRef = useRef<((key: CropKey) => void) | null>(null);
  useEffect(() => {
    keyCropRef.current = (key) => {
      if (!natural || !slot) return;
      const next = backgroundKeyCrop(
        natural,
        { x, y, width, height },
        slot,
        straight,
        turnDeg,
        key
      );
      if (!next) return;
      if ('zoom' in key) onTransformEnd?.(next.x, next.y, next.width, next.height, 0);
      else onDragEnd?.(next.x, next.y);
    };
  });
  const keyCropActive = cropping && !!part && !locked;
  useEffect(() => {
    if (!keyCropActive) return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      const key = cropKeyOf(e);
      if (!key) return;
      e.preventDefault();
      keyCropRef.current?.(key);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [keyCropActive]);

  // Visual scaling only during transform - no state updates
  const handleTransform = () => {
    const node = imageRef.current;
    if (!node || !ghost || !part) return;
    // Das Restbild skaliert mit dem sichtbaren Teil, bis transformEnd den Zoom übernimmt.
    const s = node.scaleX();
    placeCropGhost(
      ghostRef.current,
      {
        x: node.x() + (ghost.x - part.box.x) * s,
        y: node.y() + (ghost.y - part.box.y) * s,
        width: ghost.width * s,
        height: ghost.height * s,
      },
      mirror,
      turnDeg
    );
  };

  const handleTransformEnd = useCallback(() => {
    const node = imageRef.current;
    if (!node) return;

    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    if (slot && part && straight && natural) {
      // Begradigt: der Zoom hält den Mindestzoom des Winkels und die Deckung.
      node.scale({ x: 1, y: 1 });
      const zoomed = zoomStraightPhoto(straight, scaleX, turnDeg, slot);
      placeCropGhost(ghostRef.current, zoomed, mirror, turnDeg);
      const next = windowInPhoto(
        windowPhotoOfStraight(natural, zoomed, turnDeg, slot),
        width / height
      );
      onTransformEnd?.(next.x, next.y, next.width, next.height, 0);
      return;
    }
    if (slot && part) {
      // The handles sit on the visible part; they zoom the photo about its middle.
      node.scale({ x: 1, y: 1 });
      const zoomed = zoomWindow({ x, y, width, height }, scaleX, slot);
      if (natural) placeCropGhost(ghostRef.current, photoRectAround(natural, zoomed), mirror);
      onTransformEnd?.(zoomed.x, zoomed.y, zoomed.width, zoomed.height, 0);
      return;
    }
    const currentWidth = node.width();
    const currentHeight = node.height();
    const nodeRotation = normalizeRotation(node.rotation());

    const SCALE_THRESHOLD = 0.03;
    const scaleChanged =
      Math.abs(scaleX - 1) > SCALE_THRESHOLD || Math.abs(scaleY - 1) > SCALE_THRESHOLD;

    if (scaleChanged) {
      const newWidth = Math.round(currentWidth * scaleX);
      const newHeight = Math.round(currentHeight * scaleY);

      node.scale({ x: 1, y: 1 });
      node.width(newWidth);
      node.height(newHeight);

      onTransformEnd?.(node.x(), node.y(), newWidth, newHeight, nodeRotation);
    } else {
      node.scale({ x: 1, y: 1 });
      onTransformEnd?.(node.x(), node.y(), currentWidth, currentHeight, nodeRotation);
    }
  }, [onTransformEnd, slot, part, straight, turnDeg, natural, mirror, x, y, width, height]);

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
      {ghostAttrs && ghostImage && (
        <KonvaImage
          ref={ghostRef}
          name={`selection-chrome ${CROP_GHOST_NAME}`}
          image={ghostImage}
          opacity={CROP_GHOST_OPACITY}
          listening={false}
          {...ghostAttrs}
        />
      )}
      <KonvaImage
        ref={imageRef}
        id={id}
        image={image}
        x={part?.box.x ?? x}
        y={part?.box.y ?? y}
        width={part?.box.width ?? width}
        height={part?.box.height ?? height}
        rotation={coverFit ? 0 : rotation}
        crop={part?.crop}
        opacity={opacity}
        draggable={draggable && !locked}
        dragBoundFunc={dragBoundFunc}
        onMouseDown={onSelect}
        onTouchStart={handleTouchStart}
        onDblClick={onToggleCrop ?? undefined}
        onDblTap={onToggleCrop ?? undefined}
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
        {...(draw ? { sceneFunc: straightSceneFunc, [STRAIGHT_DRAW_ATTR]: draw } : {})}
      />
      {selected && (
        <Transformer
          ref={trRef}
          rotateEnabled={transformConfig?.rotateEnabled ?? false}
          keepRatio={transformConfig?.keepRatio ?? true}
          enabledAnchors={enabledAnchors}
          boundBoxFunc={(oldBox, newBox) => {
            const minWidth = transformConfig?.bounds?.minWidth ?? 20;
            const maxWidth = transformConfig?.bounds?.maxWidth ?? Infinity;
            if (newBox.width < minWidth) return oldBox;
            if (newBox.width > maxWidth) return oldBox;
            return newBox;
          }}
          {...ELEMENT_TRANSFORMER}
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
    'rotation',
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
    'cropping',
    'straighten',
  ];

  for (const key of keysToCompare) {
    if (prevProps[key] !== nextProps[key]) {
      return false;
    }
  }

  // Die Griffe des Hintergrundfotos wechseln mit dem Ausschnitt-Modus, auch ohne `draggable`.
  if (
    prevProps.transformConfig?.enabledAnchors?.length !==
    nextProps.transformConfig?.enabledAnchors?.length
  ) {
    return false;
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
