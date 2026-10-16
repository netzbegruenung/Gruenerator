/**
 * UserImagePrimitive - Draggable, transformable user-uploaded image
 *
 * Follows the same pattern as AssetPrimitive but loads from blob URLs
 * instead of pre-registered asset definitions. Uses the instance's
 * width/height directly (already scaled during creation).
 */

import { useState, useEffect, useRef, memo } from 'react';
import { Image, Group, Rect, Transformer } from 'react-konva';

import {
  clampPan,
  framedPhotoRect,
  panOfFramedPhoto,
  visiblePart,
  type Rect as Box,
} from '../utils/coverFit';
import { getActiveImageFilters, hasActiveImageFilters } from '../utils/imageFilters';
import { useTrackPendingImage } from '../utils/pendingImages';
import { recacheNextFrame } from '../utils/recacheNextFrame';
import { touchAnchorStyleFunc } from '../utils/touchInput';
import { USER_PHOTO_NODE_NAME, type UserImageInstance } from '../utils/userImageUtils';

import type Konva from 'konva';

export interface UserImagePrimitiveProps {
  userImage: UserImageInstance;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onDragEnd: (x: number, y: number) => void;
  onTransformEnd: (x: number, y: number, width: number, height: number, rotation: number) => void;
  /** A `cover` photo moved inside its frame (Ausschnitt mode): its new `panX` / `panY`. */
  onCropEnd?: (panX: number, panY: number) => void;
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
}: UserImagePrimitiveProps) {
  const panStartRef = useRef<Box | null>(null);
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
  }, [isSelected]);

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
    userImage.fit,
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
    ? framedPhotoRect(natural, frame, { x: userImage.panX ?? 0, y: userImage.panY ?? 0 })
    : null;
  const crop = (photo && visiblePart(natural, photo, frame)?.crop) ?? undefined;
  const isCropping = cropping && !!photo;

  const panPhoto = (node: Konva.Node) => {
    const start = panStartRef.current;
    if (!start) return null;
    const { dx, dy } = clampPan(start, node.x() - start.x, node.y() - start.y, frame);
    const moved = { ...start, x: start.x + dx, y: start.y + dy };
    node.position(moved);
    const part = visiblePart(natural, moved, frame);
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
        draggable={draggable && !isCropping}
        onDblClick={() => cover && onCroppingChange?.(!cropping)}
        onDblTap={() => cover && onCroppingChange?.(!cropping)}
        onMouseDown={(e) => {
          e.cancelBubble = true;
          onSelect(userImage.id);
        }}
        onTouchStart={(e) => {
          e.cancelBubble = true;
          onSelect(userImage.id);
        }}
        onDragEnd={(e) => {
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
            {...photo}
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
              onCropEnd?.(pan.x, pan.y);
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
          blurRadius={userImage.blur ?? 0}
          brightness={userImage.brightness ?? 0}
          contrast={userImage.contrast ?? 0}
          saturation={userImage.saturation ?? 0}
          hue={userImage.hue ?? 0}
          temperature={userImage.temperature ?? 0}
          tint={userImage.tint}
          tintStrength={userImage.tintStrength ?? 0}
          shadowColor={userImage.shadowColor}
          shadowBlur={userImage.shadowBlur}
          shadowOffsetX={userImage.shadowOffsetX}
          shadowOffsetY={userImage.shadowOffsetY}
          shadowOpacity={userImage.shadowOpacity}
        />

        {isSelected && (
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
          anchorStyleFunc={touchAnchorStyleFunc}
          ref={transformerRef}
          keepRatio={true}
          enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
          anchorSize={10}
          anchorCornerRadius={5}
          borderStroke="#005437"
          anchorStroke="#005437"
          anchorFill="#ffffff"
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
  if (prev.fit !== next.fit) return false;
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

  return true;
});

UserImagePrimitive.displayName = 'UserImagePrimitive';
