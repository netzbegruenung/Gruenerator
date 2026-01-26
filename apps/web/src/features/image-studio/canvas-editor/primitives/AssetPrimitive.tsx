import React, { useState, useEffect, useRef, memo } from 'react';
import { Image, Group, Rect, Transformer } from 'react-konva';

import { getAssetById } from '../utils/canvasAssets';

import type { AssetInstance } from '../utils/canvasAssets';
import type Konva from 'konva';


export interface AssetPrimitiveProps {
  asset: AssetInstance;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onDragEnd: (x: number, y: number) => void;
  onTransformEnd: (x: number, y: number, scale: number, rotation: number) => void;
  draggable?: boolean;
}

function AssetPrimitiveInner({
  asset,
  isSelected,
  onSelect,
  onDragEnd,
  onTransformEnd,
  draggable = true,
}: AssetPrimitiveProps) {
  const groupRef = useRef<Konva.Group>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [imageSize, setImageSize] = useState({ width: 100, height: 100 });

  // Load image from asset definition
  useEffect(() => {
    const assetDef = getAssetById(asset.assetId);
    if (!assetDef) return;

    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.src = assetDef.src;
    img.onload = () => {
      setImage(img);
      setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
    };
  }, [asset.assetId]);

  // Attach transformer when selected
  useEffect(() => {
    if (isSelected && transformerRef.current && groupRef.current) {
      transformerRef.current.nodes([groupRef.current]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

  if (!image) return null;

  // Normalize to a consistent target size while maintaining aspect ratio
  const TARGET_SIZE = 150;
  const maxDim = Math.max(imageSize.width, imageSize.height);
  const baseScale = TARGET_SIZE / maxDim;
  const scaledWidth = imageSize.width * baseScale;
  const scaledHeight = imageSize.height * baseScale;

  return (
    <>
      <Group
        ref={groupRef}
        x={asset.x}
        y={asset.y}
        scaleX={asset.scale}
        scaleY={asset.scale}
        rotation={asset.rotation}
        opacity={asset.opacity}
        draggable={draggable}
        onClick={(e) => {
          e.cancelBubble = true;
          onSelect(asset.id);
        }}
        onTap={(e) => {
          e.cancelBubble = true;
          onSelect(asset.id);
        }}
        onDragEnd={(e) => {
          onDragEnd(e.target.x(), e.target.y());
        }}
        onTransformEnd={() => {
          const node = groupRef.current;
          if (!node) return;

          const scaleX = node.scaleX();
          const scaleY = node.scaleY();
          const newScale = Math.max(scaleX, scaleY);
          const newRotation = node.rotation();

          // Reset node transform to prevent accumulation
          node.scaleX(asset.scale);
          node.scaleY(asset.scale);
          node.rotation(asset.rotation);

          onTransformEnd(node.x(), node.y(), newScale, newRotation);
        }}
      >
        <Image
          image={image}
          width={scaledWidth}
          height={scaledHeight}
          offsetX={scaledWidth / 2}
          offsetY={scaledHeight / 2}
        />

        {isSelected && (
          <Rect
            x={-scaledWidth / 2}
            y={-scaledHeight / 2}
            width={scaledWidth}
            height={scaledHeight}
            stroke="#005437"
            strokeWidth={2 / asset.scale}
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

/**
 * Memoized AssetPrimitive - Prevents unnecessary re-renders during drag
 */
export const AssetPrimitive = memo(AssetPrimitiveInner, (prevProps, nextProps) => {
  // Compare asset object properties
  const prev = prevProps.asset;
  const next = nextProps.asset;

  if (prev.id !== next.id) return false;
  if (prev.assetId !== next.assetId) return false;
  if (prev.x !== next.x) return false;
  if (prev.y !== next.y) return false;
  if (prev.scale !== next.scale) return false;
  if (prev.rotation !== next.rotation) return false;
  if (prev.opacity !== next.opacity) return false;

  // Compare other props
  if (prevProps.isSelected !== nextProps.isSelected) return false;
  if (prevProps.draggable !== nextProps.draggable) return false;

  // Callbacks are considered stable
  return true;
});

AssetPrimitive.displayName = 'AssetPrimitive';
