/**
 * UserImagePrimitive - Draggable, transformable user-uploaded image
 *
 * Follows the same pattern as AssetPrimitive but loads from blob URLs
 * instead of pre-registered asset definitions. Uses the instance's
 * width/height directly (already scaled during creation).
 */

import { activeBrand } from '@ggraphic/editor/brand/brandRegistry';
import { LOCKED_TRANSFORMER, useIsItemLocked } from '@ggraphic/editor/components/canvasItemLock';
import { useAnnounce } from '@ggraphic/editor/hooks/useAnnounce';
import { useBoxSnap, type SnapProps } from '@ggraphic/editor/hooks/useBoxSnap';
import {
  clampPan,
  covers,
  framedPhotoRect,
  panOfFramedPhoto,
  visiblePart,
  type Rect as Box,
} from '@ggraphic/editor/utils/coverFit';
import {
  cropAspectRatio,
  frameForAspect,
  type CropAspectId,
} from '@ggraphic/editor/utils/cropAspect';
import { ELEMENT_TRANSFORMER } from '@ggraphic/editor/utils/orientation';
import { useTrackPendingImage } from '@ggraphic/editor/utils/pendingImages';
import { recacheNextFrame } from '@ggraphic/editor/utils/recacheNextFrame';
import {
  clampPointToStraightPhoto,
  frameForAspectOnStraightPhoto,
  panOfStraightPhoto,
  panStraightPhoto,
  STRAIGHT_DRAW_ATTR,
  straightDrawOf,
  straightFramedPhoto,
  straightPhotoCovers,
  straightScaleCrop,
  straightSceneFunc,
} from '@ggraphic/editor/utils/straighten';
import { touchAnchorStyleFunc } from '@ggraphic/editor/utils/touchInput';
import { useState, useEffect, useRef, useMemo, memo } from 'react';
import { Image, Group, Rect, Transformer } from 'react-konva';

import {
  CROP_GHOST_NAME,
  CROP_GHOST_OPACITY,
  cropGhostAttrs,
  cropGhostSource,
} from '../utils/cropGhost';
import {
  getActiveImageFilters,
  hasActiveImageFilters,
  imageFilterAttrs,
} from '../utils/imageFilters';
import { cropKeyOf, userImageKeyCrop } from '../utils/keyboardCrop';
import { userImageBox } from '../utils/renderedBoxes';
import { userImageCropUpdate } from '../utils/userImageCrop';
import { USER_PHOTO_NODE_NAME, type UserImageInstance } from '../utils/userImageUtils';

import type Konva from 'konva';

// Konva hält das Verhältnis nur an den Ecken; Kantengriffe würden es brechen.
const CORNER_ANCHORS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
const ALL_ANCHORS = [
  ...CORNER_ANCHORS,
  'top-center',
  'middle-right',
  'middle-left',
  'bottom-center',
];

export interface UserImagePrimitiveProps extends SnapProps {
  userImage: UserImageInstance;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onDragEnd: (x: number, y: number) => void;
  onTransformEnd: (x: number, y: number, width: number, height: number, rotation: number) => void;
  /** One atomic image update for a moved photo or a resized crop window. */
  onCropEnd?: (patch: Partial<UserImageInstance>) => void;
  /** Ausschnitt mode (Canva's crop): double-click or the context bar's button turns it on. */
  isCropping?: boolean;
  onCroppingChange?: (on: boolean) => void;
  /** Seitenverhältnis-Vorgabe des Zuschneide-Modus: setzt den Rahmen und hält ihn beim Ziehen. */
  cropAspect?: CropAspectId;
  draggable?: boolean;
}

function UserImagePrimitiveInner({
  userImage,
  isSelected,
  onSelect,
  onDragEnd,
  onTransformEnd,
  onCropEnd,
  isCropping: cropping = false,
  onCroppingChange,
  cropAspect = 'free',
  draggable = true,
  ...snapProps
}: UserImagePrimitiveProps) {
  const locked = useIsItemLocked();
  const snap = useBoxSnap({ id: userImage.id, ...snapProps }, userImageBox(userImage));
  const announce = useAnnounce();
  const panStartRef = useRef<Box | null>(null);
  const cropFrameRef = useRef<Konva.Rect>(null);
  const cropTransformerRef = useRef<Konva.Transformer>(null);
  const groupRef = useRef<Konva.Group>(null);
  const imageRef = useRef<Konva.Image>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [settled, setSettled] = useState<{ src: string; ok: boolean } | null>(null);
  const appliedAspectRef = useRef<CropAspectId>('free');

  useEffect(() => {
    const src = userImage.src;
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.src = src;
    img.onload = () => {
      setImage(img);
      setSettled({ src, ok: true });
    };
    img.onerror = () => setSettled({ src, ok: false });

    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [userImage.src]);
  useTrackPendingImage(
    userImage.id,
    userImage.src,
    settled?.src !== userImage.src ? 'loading' : settled.ok ? 'loaded' : 'failed'
  );

  useEffect(() => {
    if (isSelected && transformerRef.current && groupRef.current) {
      transformerRef.current.nodes([groupRef.current]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected, cropping, image]);

  useEffect(() => {
    if (cropping && !locked && cropFrameRef.current && cropTransformerRef.current) {
      cropTransformerRef.current.nodes([cropFrameRef.current]);
    }
  }, [cropping, locked, image]);

  // Eine neu gewählte Vorgabe setzt den Rahmen einmal; danach bewegt ihn nur der Transformer.
  const aspectActive = cropping && isSelected && !locked;
  useEffect(() => {
    if (!aspectActive) {
      appliedAspectRef.current = 'free';
      return;
    }
    if (!image || appliedAspectRef.current === cropAspect) return;
    appliedAspectRef.current = cropAspect;
    const natural = { width: image.naturalWidth, height: image.naturalHeight };
    const ratio = cropAspectRatio(cropAspect, natural);
    if (ratio === null) return;
    const frame = { x: 0, y: 0, width: userImage.width, height: userImage.height };
    const deg = userImage.fit === 'cover' ? (userImage.cropRotation ?? 0) : 0;
    const photo =
      userImage.fit === 'cover'
        ? straightFramedPhoto(
            natural,
            frame,
            { x: userImage.panX ?? 0, y: userImage.panY ?? 0 },
            userImage.cropZoom ?? 1,
            deg
          )
        : frame;
    const window =
      deg !== 0
        ? frameForAspectOnStraightPhoto(frame, photo, deg, ratio)
        : frameForAspect(frame, photo, ratio);
    const same =
      Math.abs(window.x) < 0.5 &&
      Math.abs(window.y) < 0.5 &&
      Math.abs(window.width - frame.width) < 0.5 &&
      Math.abs(window.height - frame.height) < 0.5;
    if (!same) onCropEnd?.(userImageCropUpdate(userImage, natural, photo, window));
  }, [aspectActive, cropAspect, image, userImage, onCropEnd]);

  // Konva filters require the node to be cached first.
  useEffect(() => {
    const node = imageRef.current;
    if (!node || !image) return;
    if (hasActiveImageFilters(userImage)) {
      node.cache();
    } else {
      node.clearCache();
    }
    node.getLayer()?.batchDraw();
  }, [
    image,
    userImage.width,
    userImage.height,
    userImage.blur,
    userImage.brightness,
    userImage.contrast,
    userImage.saturation,
    userImage.hue,
    userImage.temperature,
    userImage.grayscale,
    userImage.sepia,
    userImage.invert,
    userImage.tint,
    userImage.tintStrength,
    userImage.vignette,
    userImage.flipX,
    userImage.flipY,
    userImage.fit,
    userImage.cropZoom,
    userImage.panX,
    userImage.panY,
    userImage.cropRotation,
    userImage.mask,
  ]);

  // Das Restbild trägt dieselbe Bearbeitung wie das Bild im Rahmen.
  const ghostImage = useMemo(
    () =>
      cropping && image
        ? cropGhostSource(image, userImage, userImage.width * (userImage.cropZoom ?? 1))
        : null,
    [cropping, image, userImage]
  );

  const keyCropRef = useRef({ image, userImage, onCropEnd });
  useEffect(() => {
    keyCropRef.current = { image, userImage, onCropEnd };
  });
  const keyCropActive = cropping && isSelected && !locked;

  useEffect(() => {
    if (keyCropActive) announce('Ausschnitt: Pfeiltasten verschieben, Enter beendet');
  }, [keyCropActive, announce]);

  // Keyboard crop: arrows pan the photo inside the frame (Shift = 10 px),
  // +/- zoom. Same commit as the drag (`onCropEnd`), so one update per key.
  useEffect(() => {
    if (!keyCropActive) return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      const current = keyCropRef.current;
      const key = current.image ? cropKeyOf(e) : null;
      if (!current.image || !key) return;
      e.preventDefault();
      const patch = userImageKeyCrop(
        { width: current.image.naturalWidth, height: current.image.naturalHeight },
        current.userImage,
        key
      );
      if (patch) current.onCropEnd?.(patch);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [keyCropActive]);

  if (!image) return null;

  const { width, height } = userImage;
  const natural = { width: image.naturalWidth, height: image.naturalHeight };
  const frame = { x: 0, y: 0, width, height };
  const cover = userImage.fit === 'cover';
  // Begradigt: das Foto dreht sich im Rahmen; Konvas `crop` kann das nicht, `straightSceneFunc` zeichnet.
  const deg = cover ? (userImage.cropRotation ?? 0) : 0;
  const turned = deg !== 0;
  const keptPan = { x: userImage.panX ?? 0, y: userImage.panY ?? 0 };
  const photo = cover
    ? turned
      ? straightFramedPhoto(natural, frame, keptPan, userImage.cropZoom ?? 1, deg)
      : framedPhotoRect(natural, frame, keptPan, userImage.cropZoom ?? 1)
    : { ...frame };
  const mirror = { x: !!userImage.flipX, y: !!userImage.flipY };
  const crop = cover
    ? turned
      ? straightScaleCrop(natural, photo, frame)
      : visiblePart(natural, photo, frame, mirror)?.crop
    : undefined;
  const draw = turned ? straightDrawOf(photo, deg, frame, mirror) : null;
  // Gedreht mit Schatten: ein Radius > 0 lässt Konva über einen Puffer zeichnen, sonst schnitte der Rahmen den Schatten ab.
  const cornerRadius =
    userImage.mask === 'kreis'
      ? Math.min(width, height) / 2
      : turned && userImage.shadowColor
        ? 0.01
        : 0;
  const isCropping = aspectActive;
  const lockedRatio = cropAspectRatio(cropAspect, natural) !== null;
  // The dimmed whole photo mirrors by a negative scale, so its node origin
  // sits on the far edge of a flipped axis.
  const ghostShift = photo
    ? { x: mirror.x ? photo.width : 0, y: mirror.y ? photo.height : 0 }
    : { x: 0, y: 0 };

  const panPhoto = (node: Konva.Node) => {
    const start = panStartRef.current;
    if (!start) return null;
    if (turned) {
      // Der Knoten des Restbilds sitzt gedreht auf der Mitte des Fotos.
      const origin = cropGhostAttrs(start, mirror, deg);
      const moved = panStraightPhoto(start, deg, frame, node.x() - origin.x, node.y() - origin.y);
      const placed = cropGhostAttrs(moved, mirror, deg);
      node.position({ x: placed.x, y: placed.y });
      if (imageRef.current) {
        imageRef.current.setAttr(STRAIGHT_DRAW_ATTR, straightDrawOf(moved, deg, frame, mirror));
        recacheNextFrame(imageRef.current);
      }
      return moved;
    }
    const { dx, dy } = clampPan(
      start,
      node.x() - ghostShift.x - start.x,
      node.y() - ghostShift.y - start.y,
      frame
    );
    const moved = { ...start, x: start.x + dx, y: start.y + dy };
    node.position({ x: moved.x + ghostShift.x, y: moved.y + ghostShift.y });
    const part = visiblePart(natural, moved, frame, mirror);
    if (part && imageRef.current) {
      imageRef.current.crop(part.crop);
      recacheNextFrame(imageRef.current);
    }
    return moved;
  };

  return (
    <>
      <Group
        ref={groupRef}
        x={userImage.x}
        y={userImage.y}
        scaleX={userImage.scale}
        scaleY={userImage.scale}
        rotation={userImage.rotation}
        opacity={userImage.opacity}
        draggable={draggable && !isCropping && !locked}
        onDblClick={() => !locked && onCroppingChange?.(!cropping)}
        onDblTap={() => !locked && onCroppingChange?.(!cropping)}
        onMouseDown={(e) => {
          e.cancelBubble = true;
          onSelect(userImage.id);
        }}
        onTouchStart={(e) => {
          e.cancelBubble = true;
          onSelect(userImage.id);
        }}
        onDragStart={snap.onDragStart}
        onDragMove={snap.onDragMove}
        onDragEnd={(e) => {
          snap.onDragEnd();
          onDragEnd(e.target.x(), e.target.y());
        }}
        onTransformEnd={() => {
          const node = groupRef.current;
          if (!node) return;

          const scaleX = node.scaleX();
          const scaleY = node.scaleY();
          const newWidth = width * scaleX;
          const newHeight = height * scaleY;
          const newRotation = node.rotation();

          node.scaleX(1);
          node.scaleY(1);

          onTransformEnd(node.x(), node.y(), newWidth, newHeight, newRotation);
        }}
      >
        {isCropping && photo && (
          // The whole photo, dimmed: what lies outside the frame shows where it can go.
          <Image
            name={`selection-chrome ${CROP_GHOST_NAME}`}
            image={ghostImage ?? image}
            {...(turned
              ? cropGhostAttrs(photo, mirror, deg)
              : {
                  x: photo.x + ghostShift.x,
                  y: photo.y + ghostShift.y,
                  width: photo.width,
                  height: photo.height,
                  scaleX: mirror.x ? -1 : 1,
                  scaleY: mirror.y ? -1 : 1,
                })}
            opacity={CROP_GHOST_OPACITY}
            draggable
            onMouseDown={(e) => {
              e.cancelBubble = true;
            }}
            onDragStart={(e) => {
              e.cancelBubble = true;
              panStartRef.current = { ...photo };
            }}
            onDragMove={(e) => {
              e.cancelBubble = true;
              panPhoto(e.target);
            }}
            onDragEnd={(e) => {
              e.cancelBubble = true;
              const moved = panPhoto(e.target);
              panStartRef.current = null;
              if (!moved) return;
              const pan = turned
                ? panOfStraightPhoto(moved, deg, frame, keptPan)
                : panOfFramedPhoto(moved, frame);
              onCropEnd?.({ fit: 'cover', panX: pan.x, panY: pan.y });
            }}
          />
        )}
        <Image
          ref={imageRef}
          name={USER_PHOTO_NODE_NAME}
          listening={!isCropping}
          image={image}
          width={width}
          height={height}
          crop={crop}
          cornerRadius={cornerRadius}
          filters={getActiveImageFilters(userImage)}
          {...imageFilterAttrs(userImage)}
          shadowColor={userImage.shadowColor}
          shadowBlur={userImage.shadowBlur}
          shadowOffsetX={userImage.shadowOffsetX}
          shadowOffsetY={userImage.shadowOffsetY}
          shadowOpacity={userImage.shadowOpacity}
          {...(draw ? { sceneFunc: straightSceneFunc, [STRAIGHT_DRAW_ATTR]: draw } : {})}
        />

        {isCropping && (
          <>
            <Rect
              ref={cropFrameRef}
              name="selection-chrome"
              width={width}
              height={height}
              listening={false}
              onTransform={(e) => {
                e.cancelBubble = true;
                const node = cropFrameRef.current;
                const drawn = imageRef.current;
                if (!node || !drawn) return;
                const window = {
                  x: node.x(),
                  y: node.y(),
                  width: node.width() * node.scaleX(),
                  height: node.height() * node.scaleY(),
                };
                if (turned) {
                  drawn.position(window);
                  drawn.size(window);
                  drawn.setAttr(STRAIGHT_DRAW_ATTR, straightDrawOf(photo, deg, window, mirror));
                  recacheNextFrame(drawn);
                  return;
                }
                const part = visiblePart(natural, photo, window, mirror);
                if (part) {
                  drawn.position(part.box);
                  drawn.size(part.box);
                  drawn.crop(part.crop);
                  recacheNextFrame(drawn);
                }
              }}
              onTransformEnd={(e) => {
                e.cancelBubble = true;
                const node = cropFrameRef.current;
                if (!node) return;
                const window = {
                  x: node.x(),
                  y: node.y(),
                  width: node.width() * node.scaleX(),
                  height: node.height() * node.scaleY(),
                };
                node.setAttrs({ x: 0, y: 0, scaleX: 1, scaleY: 1 });
                imageRef.current?.position({ x: 0, y: 0 });
                imageRef.current?.size({ width, height });
                if (draw) imageRef.current?.setAttr(STRAIGHT_DRAW_ATTR, draw);
                onCropEnd?.(userImageCropUpdate(userImage, natural, photo, window));
              }}
            />
            <Transformer
              ref={cropTransformerRef}
              name="selection-chrome"
              anchorStyleFunc={touchAnchorStyleFunc}
              keepRatio={lockedRatio}
              enabledAnchors={lockedRatio ? CORNER_ANCHORS : ALL_ANCHORS}
              rotateEnabled={false}
              flipEnabled={false}
              anchorSize={10}
              borderStroke={activeBrand().colors.primary}
              anchorStroke={activeBrand().colors.primary}
              anchorFill="#ffffff"
              anchorDragBoundFunc={(oldPos, newPos) => {
                const group = groupRef.current;
                if (!group) return oldPos;
                const transform = group.getAbsoluteTransform();
                const local = transform.copy().invert().point(newPos);
                if (turned) return transform.point(clampPointToStraightPhoto(local, photo, deg));
                return transform.point({
                  x: Math.max(photo.x, Math.min(photo.x + photo.width, local.x)),
                  y: Math.max(photo.y, Math.min(photo.y + photo.height, local.y)),
                });
              }}
              boundBoxFunc={(oldBox, newBox) => {
                if (newBox.width < 16 || newBox.height < 16) return oldBox;
                const group = groupRef.current;
                // Gedreht hält ein Griff allein nicht alle Ecken auf dem Foto: das prüft der ganze Rahmen.
                if ((!lockedRatio && !turned) || !group) return newBox;
                // Mit festem Verhältnis zieht Konva den Griff auf die Diagonale zurück
                // und kann dabei übers Foto hinausschieben: dann bleibt der Rahmen stehen.
                const corner = group.getAbsoluteTransform().copy().invert().point(newBox);
                const scale = group.getAbsoluteScale();
                const local = {
                  ...corner,
                  width: newBox.width / scale.x,
                  height: newBox.height / scale.y,
                };
                const inside = turned
                  ? straightPhotoCovers(photo, deg, local)
                  : covers(photo, local);
                return inside ? newBox : oldBox;
              }}
            />
          </>
        )}

        {isSelected && !isCropping && (
          <Rect
            name="selection-chrome"
            width={width}
            height={height}
            stroke={activeBrand().colors.primary}
            strokeWidth={2 / userImage.scale}
            dash={[5, 5]}
            listening={false}
          />
        )}
      </Group>

      {isSelected && !isCropping && (
        <Transformer
          ref={transformerRef}
          keepRatio={true}
          enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
          rotateEnabled={true}
          {...ELEMENT_TRANSFORMER}
          {...(locked ? LOCKED_TRANSFORMER : {})}
        />
      )}
    </>
  );
}

export const UserImagePrimitive = memo(UserImagePrimitiveInner, (prevProps, nextProps) => {
  const prev = prevProps.userImage;
  const next = nextProps.userImage;

  if (prev.id !== next.id) return false;
  if (prev.src !== next.src) return false;
  if (prev.x !== next.x) return false;
  if (prev.y !== next.y) return false;
  if (prev.width !== next.width) return false;
  if (prev.height !== next.height) return false;
  if (prev.scale !== next.scale) return false;
  if (prev.rotation !== next.rotation) return false;
  if (prev.opacity !== next.opacity) return false;
  if (prev.blur !== next.blur) return false;
  if (prev.brightness !== next.brightness) return false;
  if (prev.contrast !== next.contrast) return false;
  if (prev.saturation !== next.saturation) return false;
  if (prev.hue !== next.hue) return false;
  if (prev.temperature !== next.temperature) return false;
  if (prev.grayscale !== next.grayscale) return false;
  if (prev.sepia !== next.sepia) return false;
  if (prev.invert !== next.invert) return false;
  if (prev.tint !== next.tint) return false;
  if (prev.tintStrength !== next.tintStrength) return false;
  if (prev.vignette !== next.vignette) return false;
  if (prev.flipX !== next.flipX) return false;
  if (prev.flipY !== next.flipY) return false;
  if (prev.fit !== next.fit) return false;
  if (prev.cropZoom !== next.cropZoom) return false;
  if (prev.panX !== next.panX) return false;
  if (prev.panY !== next.panY) return false;
  if (prev.cropRotation !== next.cropRotation) return false;
  if (prev.mask !== next.mask) return false;
  if (prev.shadowColor !== next.shadowColor) return false;
  if (prev.shadowBlur !== next.shadowBlur) return false;
  if (prev.shadowOffsetX !== next.shadowOffsetX) return false;
  if (prev.shadowOffsetY !== next.shadowOffsetY) return false;
  if (prev.shadowOpacity !== next.shadowOpacity) return false;

  if (prevProps.isSelected !== nextProps.isSelected) return false;
  if (prevProps.draggable !== nextProps.draggable) return false;
  if (prevProps.isCropping !== nextProps.isCropping) return false;
  if (prevProps.cropAspect !== nextProps.cropAspect) return false;
  if (prevProps.stageWidth !== nextProps.stageWidth) return false;
  if (prevProps.stageHeight !== nextProps.stageHeight) return false;

  return true;
});

UserImagePrimitive.displayName = 'UserImagePrimitive';
