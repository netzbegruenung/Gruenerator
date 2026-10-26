/**
 * UserImagePrimitive - Draggable, transformable user-uploaded image
 *
 * Follows the same pattern as AssetPrimitive but loads from blob URLs
 * instead of pre-registered asset definitions. Uses the instance's
 * width/height directly (already scaled during creation).
 */

import { useState, useEffect, useRef, memo } from 'react';
import { Image, Group, Rect, Transformer } from 'react-konva';

import { LOCKED_TRANSFORMER, useIsItemLocked } from '../components/canvasItemLock';
import { useBoxSnap, type SnapProps } from '../hooks/useBoxSnap';
import {
  clampPan,
  framedPhotoRect,
  panOfFramedPhoto,
  visiblePart,
  type Rect as Box,
} from '../utils/coverFit';
import {
  getActiveImageFilters,
  hasActiveImageFilters,
  imageFilterAttrs,
} from '../utils/imageFilters';
import { ELEMENT_TRANSFORMER } from '../utils/orientation';
import { useTrackPendingImage } from '../utils/pendingImages';
import { recacheNextFrame } from '../utils/recacheNextFrame';
import { userImageBox } from '../utils/renderedBoxes';
import { touchAnchorStyleFunc } from '../utils/touchInput';
import { userImageCropUpdate } from '../utils/userImageCrop';
import { USER_PHOTO_NODE_NAME, type UserImageInstance } from '../utils/userImageUtils';

import type Konva from 'konva';

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
  draggable = true,
  ...snapProps
}: UserImagePrimitiveProps) {
  const locked = useIsItemLocked();
  const snap = useBoxSnap({ id: userImage.id, ...snapProps }, userImageBox(userImage));
  const panStartRef = useRef<Box | null>(null);
  const cropFrameRef = useRef<Konva.Rect>(null);
  const cropTransformerRef = useRef<Konva.Transformer>(null);
  const groupRef = useRef<Konva.Group>(null);
  const imageRef = useRef<Konva.Image>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [settled, setSettled] = useState<{ src: string; ok: boolean } | null>(null);

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
    userImage.mask,
  ]);

  if (!image) return null;

  const { width, height } = userImage;
  const natural = { width: image.naturalWidth, height: image.naturalHeight };
  const frame = { x: 0, y: 0, width, height };
  const cover = userImage.fit === 'cover';
  const photo = cover
    ? framedPhotoRect(
        natural,
        frame,
        { x: userImage.panX ?? 0, y: userImage.panY ?? 0 },
        userImage.cropZoom ?? 1
      )
    : { ...frame };
  const mirror = { x: !!userImage.flipX, y: !!userImage.flipY };
  const crop = cover ? visiblePart(natural, photo, frame, mirror)?.crop : undefined;
  const isCropping = cropping && isSelected && !locked;
  // The dimmed whole photo mirrors by a negative scale, so its node origin
  // sits on the far edge of a flipped axis.
  const ghostShift = photo
    ? { x: mirror.x ? photo.width : 0, y: mirror.y ? photo.height : 0 }
    : { x: 0, y: 0 };

  const panPhoto = (node: Konva.Node) => {
    const start = panStartRef.current;
    if (!start) return null;
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
            name="selection-chrome"
            image={image}
            x={photo.x + ghostShift.x}
            y={photo.y + ghostShift.y}
            width={photo.width}
            height={photo.height}
            scaleX={mirror.x ? -1 : 1}
            scaleY={mirror.y ? -1 : 1}
            opacity={0.35}
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
              const pan = panOfFramedPhoto(moved, frame);
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
          cornerRadius={userImage.mask === 'kreis' ? Math.min(width, height) / 2 : 0}
          filters={getActiveImageFilters(userImage)}
          {...imageFilterAttrs(userImage)}
          shadowColor={userImage.shadowColor}
          shadowBlur={userImage.shadowBlur}
          shadowOffsetX={userImage.shadowOffsetX}
          shadowOffsetY={userImage.shadowOffsetY}
          shadowOpacity={userImage.shadowOpacity}
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
                onCropEnd?.(userImageCropUpdate(userImage, natural, photo, window));
              }}
            />
            <Transformer
              ref={cropTransformerRef}
              name="selection-chrome"
              anchorStyleFunc={touchAnchorStyleFunc}
              keepRatio={false}
              rotateEnabled={false}
              flipEnabled={false}
              anchorSize={10}
              borderStroke="#005437"
              anchorStroke="#005437"
              anchorFill="#ffffff"
              anchorDragBoundFunc={(oldPos, newPos) => {
                const group = groupRef.current;
                if (!group) return oldPos;
                const transform = group.getAbsoluteTransform();
                const local = transform.copy().invert().point(newPos);
                return transform.point({
                  x: Math.max(photo.x, Math.min(photo.x + photo.width, local.x)),
                  y: Math.max(photo.y, Math.min(photo.y + photo.height, local.y)),
                });
              }}
              boundBoxFunc={(oldBox, newBox) =>
                newBox.width < 16 || newBox.height < 16 ? oldBox : newBox
              }
            />
          </>
        )}

        {isSelected && !isCropping && (
          <Rect
            name="selection-chrome"
            width={width}
            height={height}
            stroke="#005437"
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
          anchorSize={10}
          anchorCornerRadius={5}
          borderStroke="#005437"
          anchorStroke="#005437"
          anchorFill="#ffffff"
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
  if (prev.mask !== next.mask) return false;
  if (prev.shadowColor !== next.shadowColor) return false;
  if (prev.shadowBlur !== next.shadowBlur) return false;
  if (prev.shadowOffsetX !== next.shadowOffsetX) return false;
  if (prev.shadowOffsetY !== next.shadowOffsetY) return false;
  if (prev.shadowOpacity !== next.shadowOpacity) return false;

  if (prevProps.isSelected !== nextProps.isSelected) return false;
  if (prevProps.draggable !== nextProps.draggable) return false;
  if (prevProps.isCropping !== nextProps.isCropping) return false;
  if (prevProps.stageWidth !== nextProps.stageWidth) return false;
  if (prevProps.stageHeight !== nextProps.stageHeight) return false;

  return true;
});

UserImagePrimitive.displayName = 'UserImagePrimitive';
