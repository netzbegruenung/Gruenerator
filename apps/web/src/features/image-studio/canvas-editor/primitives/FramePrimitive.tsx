import React, { useRef, useEffect, useState, useCallback, memo } from 'react';
import { Group, Image as KonvaImage, Shape, Transformer, Text, Rect } from 'react-konva';

import type { FrameInstance } from '../utils/frameUtils';
import type Konva from 'konva';
import type { SceneContext } from 'konva/lib/Context';

export interface FramePrimitiveProps {
  frame: FrameInstance;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onChange: (newAttrs: Partial<FrameInstance>) => void;
  onImageUpload: (id: string, file: File, objectUrl: string) => void;
  draggable?: boolean;
}

function FramePrimitiveInner({
  frame,
  isSelected,
  onSelect,
  onChange,
  draggable = true,
}: FramePrimitiveProps) {
  const groupRef = useRef<Konva.Group>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [imageNaturalSize, setImageNaturalSize] = useState({ width: 0, height: 0 });

  // Load image when imageSrc changes
  useEffect(() => {
    if (!frame.imageSrc) {
      setImage(null);
      return;
    }

    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.src = frame.imageSrc;
    img.onload = () => {
      setImage(img);
      setImageNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
    };
  }, [frame.imageSrc]);

  // Attach transformer when selected
  useEffect(() => {
    if (isSelected && trRef.current && groupRef.current) {
      trRef.current.nodes([groupRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

  const handleDragEnd = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      onChange({ x: e.target.x(), y: e.target.y() });
    },
    [onChange]
  );

  const handleTransformEnd = useCallback(() => {
    const node = groupRef.current;
    if (!node) return;

    onChange({
      x: node.x(),
      y: node.y(),
      rotation: node.rotation(),
      scaleX: node.scaleX(),
      scaleY: node.scaleY(),
    });
  }, [onChange]);

  const handleSelect = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      e.cancelBubble = true;
      onSelect(frame.id);
    },
    [onSelect, frame.id]
  );

  const { width: w, height: h } = frame;

  // Clip function based on frame type
  const clipFunc = useCallback(
    (ctx: SceneContext) => {
      if (frame.clipType === 'circle') {
        const radius = Math.min(w, h) / 2;
        ctx.arc(w / 2, h / 2, radius, 0, Math.PI * 2);
      } else {
        const r = frame.cornerRadius;
        ctx.moveTo(r, 0);
        ctx.arcTo(w, 0, w, h, r);
        ctx.arcTo(w, h, 0, h, r);
        ctx.arcTo(0, h, 0, 0, r);
        ctx.arcTo(0, 0, w, 0, r);
        ctx.closePath();
      }
    },
    [frame.clipType, frame.cornerRadius, w, h]
  );

  // Cover-fit math for image inside frame
  let imgX = 0;
  let imgY = 0;
  let scaledW = w;
  let scaledH = h;

  if (image && imageNaturalSize.width > 0 && imageNaturalSize.height > 0) {
    const coverScale =
      Math.max(w / imageNaturalSize.width, h / imageNaturalSize.height) * frame.imageScale;
    scaledW = imageNaturalSize.width * coverScale;
    scaledH = imageNaturalSize.height * coverScale;
    imgX = (w - scaledW) / 2 + frame.imageOffsetX;
    imgY = (h - scaledH) / 2 + frame.imageOffsetY;
  }

  return (
    <>
      <Group
        ref={groupRef}
        x={frame.x}
        y={frame.y}
        rotation={frame.rotation}
        scaleX={frame.scaleX}
        scaleY={frame.scaleY}
        opacity={frame.opacity}
        offsetX={w / 2}
        offsetY={h / 2}
        draggable={draggable}
        onClick={handleSelect}
        onTap={handleSelect}
        onDragEnd={handleDragEnd}
        onTransformEnd={handleTransformEnd}
        name={`frame-${frame.id}`}
      >
        {/* Clipped image area */}
        <Group clipFunc={clipFunc} clipX={0} clipY={0} clipWidth={w} clipHeight={h}>
          {image ? (
            <KonvaImage image={image} x={imgX} y={imgY} width={scaledW} height={scaledH} />
          ) : (
            <>
              {/* Empty placeholder background */}
              <Rect x={0} y={0} width={w} height={h} fill="#f0f0f0" />
              <Text
                text="Bild\nhinzufuegen"
                x={0}
                y={h / 2 - 30}
                width={w}
                align="center"
                fontSize={16}
                fill="#999999"
                listening={false}
              />
            </>
          )}
        </Group>

        {/* Border stroke (outside clip) */}
        {frame.borderWidth > 0 && (
          <Shape
            sceneFunc={(ctx, shape) => {
              ctx.beginPath();
              if (frame.clipType === 'circle') {
                const radius = Math.min(w, h) / 2;
                ctx.arc(w / 2, h / 2, radius, 0, Math.PI * 2);
              } else {
                const r = frame.cornerRadius;
                ctx.moveTo(r, 0);
                ctx.arcTo(w, 0, w, h, r);
                ctx.arcTo(w, h, 0, h, r);
                ctx.arcTo(0, h, 0, 0, r);
                ctx.arcTo(0, 0, w, 0, r);
                ctx.closePath();
              }
              ctx.fillStrokeShape(shape);
            }}
            stroke={frame.borderColor}
            strokeWidth={frame.borderWidth}
            listening={false}
          />
        )}

        {/* Dashed border for empty frames */}
        {!frame.imageSrc && (
          <Shape
            sceneFunc={(ctx, shape) => {
              ctx.beginPath();
              if (frame.clipType === 'circle') {
                const radius = Math.min(w, h) / 2;
                ctx.arc(w / 2, h / 2, radius, 0, Math.PI * 2);
              } else {
                const r = frame.cornerRadius;
                ctx.moveTo(r, 0);
                ctx.arcTo(w, 0, w, h, r);
                ctx.arcTo(w, h, 0, h, r);
                ctx.arcTo(0, h, 0, 0, r);
                ctx.arcTo(0, 0, w, 0, r);
                ctx.closePath();
              }
              ctx.fillStrokeShape(shape);
            }}
            stroke="#999999"
            strokeWidth={2}
            dash={[8, 6]}
            listening={false}
          />
        )}
      </Group>

      {isSelected && (
        <Transformer
          ref={trRef}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 20 || newBox.height < 20) {
              return oldBox;
            }
            return newBox;
          }}
          anchorSize={10}
          anchorCornerRadius={5}
          rotateEnabled={true}
          borderStroke="#005437"
          anchorStroke="#005437"
          anchorFill="#ffffff"
        />
      )}
    </>
  );
}

export const FramePrimitive = memo(FramePrimitiveInner, (prevProps, nextProps) => {
  const prev = prevProps.frame;
  const next = nextProps.frame;

  if (prev.id !== next.id) return false;
  if (prev.clipType !== next.clipType) return false;
  if (prev.x !== next.x) return false;
  if (prev.y !== next.y) return false;
  if (prev.width !== next.width) return false;
  if (prev.height !== next.height) return false;
  if (prev.rotation !== next.rotation) return false;
  if (prev.scaleX !== next.scaleX) return false;
  if (prev.scaleY !== next.scaleY) return false;
  if (prev.opacity !== next.opacity) return false;
  if (prev.imageSrc !== next.imageSrc) return false;
  if (prev.imageOffsetX !== next.imageOffsetX) return false;
  if (prev.imageOffsetY !== next.imageOffsetY) return false;
  if (prev.imageScale !== next.imageScale) return false;
  if (prev.borderColor !== next.borderColor) return false;
  if (prev.borderWidth !== next.borderWidth) return false;
  if (prev.cornerRadius !== next.cornerRadius) return false;

  if (prevProps.isSelected !== nextProps.isSelected) return false;
  if (prevProps.draggable !== nextProps.draggable) return false;

  return true;
});

FramePrimitive.displayName = 'FramePrimitive';
