/**
 * UserImagePrimitive - Draggable, transformable user-uploaded image
 *
 * Follows the same pattern as AssetPrimitive but loads from blob URLs
 * instead of pre-registered asset definitions. Uses the instance's
 * width/height directly (already scaled during creation).
 */

import { useState, useEffect, useRef, memo } from 'react';
import { Image, Group, Rect, Transformer } from 'react-konva';

import type { UserImageInstance } from '../utils/userImageUtils';
import type Konva from 'konva';

export interface UserImagePrimitiveProps {
  userImage: UserImageInstance;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onDragEnd: (x: number, y: number) => void;
  onTransformEnd: (x: number, y: number, width: number, height: number, rotation: number) => void;
  draggable?: boolean;
}

function UserImagePrimitiveInner({
  userImage,
  isSelected,
  onSelect,
  onDragEnd,
  onTransformEnd,
  draggable = true,
}: UserImagePrimitiveProps) {
  const groupRef = useRef<Konva.Group>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.src = userImage.src;
    img.onload = () => setImage(img);

    return () => {
      img.onload = null;
    };
  }, [userImage.src]);

  useEffect(() => {
    if (isSelected && transformerRef.current && groupRef.current) {
      transformerRef.current.nodes([groupRef.current]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

  if (!image) return null;

  const { width, height } = userImage;

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
        draggable={draggable}
        onClick={(e) => {
          e.cancelBubble = true;
          onSelect(userImage.id);
        }}
        onTap={(e) => {
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
        <Image image={image} width={width} height={height} />

        {isSelected && (
          <Rect
            width={width}
            height={height}
            stroke="#005437"
            strokeWidth={2 / userImage.scale}
            dash={[5, 5]}
            listening={false}
          />
        )}
      </Group>

      {isSelected && (
        <Transformer
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

  if (prevProps.isSelected !== nextProps.isSelected) return false;
  if (prevProps.draggable !== nextProps.draggable) return false;

  return true;
});

UserImagePrimitive.displayName = 'UserImagePrimitive';
