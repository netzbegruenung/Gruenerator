import React, { useRef, useEffect, memo } from 'react';
import { Rect, Circle, RegularPolygon, Star, Path, Transformer, Group } from 'react-konva';

import { type ShapeInstance } from '../utils/shapes';

import type Konva from 'konva';

interface ShapePrimitiveProps {
  shape: ShapeInstance;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onChange: (newAttrs: Partial<ShapeInstance>) => void;
  draggable?: boolean;
}

const ShapePrimitiveInner: React.FC<ShapePrimitiveProps> = ({
  shape,
  isSelected,
  onSelect,
  onChange,
  draggable = true,
}) => {
  const shapeRef = useRef<Konva.Shape>(null);
  const trRef = useRef<Konva.Transformer>(null);

  useEffect(() => {
    if (isSelected && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    onChange({
      x: e.target.x(),
      y: e.target.y(),
    });
  };

  const handleTransformEnd = () => {
    const node = shapeRef.current;
    if (!node) return;

    const scaleX = node.scaleX();
    const scaleY = node.scaleY();

    // Reset scale and update width/height directly to prevent distortion
    // but for simple shapes, keeping scale is often easier for rotation logic.
    // Let's stick to standard Konva transform logic.

    onChange({
      x: node.x(),
      y: node.y(),
      rotation: node.rotation(),
      scaleX: scaleX,
      scaleY: scaleY,
    });
  };

  const commonProps = {
    x: shape.x,
    y: shape.y,
    fill: shape.fill,
    opacity: shape.opacity ?? 1,
    rotation: shape.rotation,
    scaleX: shape.scaleX,
    scaleY: shape.scaleY,
    draggable: draggable,
    onClick: (e: Konva.KonvaEventObject<MouseEvent>) => {
      e.cancelBubble = true;
      onSelect(shape.id);
    },
    onTap: (e: Konva.KonvaEventObject<TouchEvent>) => {
      e.cancelBubble = true;
      onSelect(shape.id);
    },
    onDragEnd: handleDragEnd,
    onTransformEnd: handleTransformEnd,
    name: `shape-${shape.id}`,
  };

  return (
    <>
      {shape.type === 'rect' && (
        <Rect
          ref={shapeRef as React.RefObject<Konva.Rect>}
          {...commonProps}
          width={shape.width}
          height={shape.height}
          offsetX={shape.width / 2}
          offsetY={shape.height / 2}
        />
      )}

      {shape.type === 'circle' && (
        <Circle
          ref={shapeRef as React.RefObject<Konva.Circle>}
          {...commonProps}
          width={shape.width}
          height={shape.height}
          radius={shape.width / 2}
        />
      )}

      {shape.type === 'triangle' && (
        <RegularPolygon
          ref={shapeRef as React.RefObject<Konva.RegularPolygon>}
          {...commonProps}
          sides={3}
          radius={shape.width / 2}
        />
      )}

      {shape.type === 'star' && (
        <Star
          ref={shapeRef as React.RefObject<Konva.Star>}
          {...commonProps}
          numPoints={5}
          innerRadius={shape.width / 4}
          outerRadius={shape.width / 2}
        />
      )}

      {shape.type === 'arrow' && (
        <Path
          ref={shapeRef as React.RefObject<Konva.Path>}
          {...commonProps}
          data="M0,20 L50,20 L50,0 L100,50 L50,100 L50,80 L0,80 Z"
          offsetX={50}
          offsetY={50}
          scaleX={(shape.width / 100) * shape.scaleX}
          scaleY={(shape.height / 100) * shape.scaleY}
        />
      )}

      {shape.type === 'heart' && (
        <Path
          ref={shapeRef as React.RefObject<Konva.Path>}
          {...commonProps}
          data="M50,90 C50,90 10,70 10,40 C10,15 30,5 50,30 C70,5 90,15 90,40 C90,70 50,90 50,90 Z"
          offsetX={50}
          offsetY={50}
          scaleX={(shape.width / 100) * shape.scaleX}
          scaleY={(shape.height / 100) * shape.scaleY}
        />
      )}

      {shape.type === 'cloud' && (
        <Path
          ref={shapeRef as React.RefObject<Konva.Path>}
          {...commonProps}
          data="M25,60 C10,60 0,50 0,35 C0,20 15,10 25,15 C30,5 45,0 60,5 C75,10 80,20 80,25 C90,25 100,35 100,50 C100,65 85,75 70,70 C60,80 35,80 25,60 Z"
          offsetX={50}
          offsetY={40}
          scaleX={(shape.width / 100) * shape.scaleX}
          scaleY={(shape.height / 100) * shape.scaleY}
        />
      )}

      {isSelected && (
        <Transformer
          ref={trRef}
          boundBoxFunc={(oldBox, newBox) => {
            // Limit minimum size
            if (newBox.width < 5 || newBox.height < 5) {
              return oldBox;
            }
            return newBox;
          }}
          anchorSize={10}
          anchorCornerRadius={5}
          rotateEnabled={true}
          borderStroke={
            shape.fill === '#316049' || shape.fill === '#000000' ? '#ffffff' : '#316049'
          }
          anchorStroke={
            shape.fill === '#316049' || shape.fill === '#000000' ? '#ffffff' : '#316049'
          }
          anchorFill="#ffffff"
        />
      )}
    </>
  );
};

/**
 * Memoized ShapePrimitive - Prevents unnecessary re-renders during drag
 */
export const ShapePrimitive = memo(ShapePrimitiveInner, (prevProps, nextProps) => {
  // Compare shape object properties
  const prevShape = prevProps.shape;
  const nextShape = nextProps.shape;

  if (prevShape.id !== nextShape.id) return false;
  if (prevShape.type !== nextShape.type) return false;
  if (prevShape.x !== nextShape.x) return false;
  if (prevShape.y !== nextShape.y) return false;
  if (prevShape.width !== nextShape.width) return false;
  if (prevShape.height !== nextShape.height) return false;
  if (prevShape.fill !== nextShape.fill) return false;
  if (prevShape.rotation !== nextShape.rotation) return false;
  if (prevShape.scaleX !== nextShape.scaleX) return false;
  if (prevShape.scaleY !== nextShape.scaleY) return false;
  if (prevShape.opacity !== nextShape.opacity) return false;

  // Compare other props
  if (prevProps.isSelected !== nextProps.isSelected) return false;
  if (prevProps.draggable !== nextProps.draggable) return false;

  // Callbacks are considered stable
  return true;
});

ShapePrimitive.displayName = 'ShapePrimitive';
