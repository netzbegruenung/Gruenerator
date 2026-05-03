import React, { useRef, useEffect, memo } from 'react';
import {
  Rect,
  Circle,
  RegularPolygon,
  Star,
  Path,
  Ellipse,
  Ring,
  Transformer,
} from 'react-konva';

import { type ShapeInstance } from '../utils/shapes';

import type Konva from 'konva';

interface ShapePrimitiveProps {
  shape: ShapeInstance;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onChange: (newAttrs: Partial<ShapeInstance>) => void;
  draggable?: boolean;
}

// SVG paths are designed in a 100x100 viewBox. Renderer rescales to shape.width/height.
const PATH_VIEWBOX = 100;

const SHAPE_PATHS: Partial<Record<ShapeInstance['type'], string>> = {
  arrow: 'M0,20 L50,20 L50,0 L100,50 L50,100 L50,80 L0,80 Z',
  heart: 'M50,90 C50,90 10,70 10,40 C10,15 30,5 50,30 C70,5 90,15 90,40 C90,70 50,90 50,90 Z',
  cloud:
    'M25,60 C10,60 0,50 0,35 C0,20 15,10 25,15 C30,5 45,0 60,5 C75,10 80,20 80,25 C90,25 100,35 100,50 C100,65 85,75 70,70 C60,80 35,80 25,60 Z',
  chevron: 'M20,10 L40,10 L80,50 L40,90 L20,90 L60,50 Z',
  'double-arrow':
    'M0,50 L25,20 L25,40 L75,40 L75,20 L100,50 L75,80 L75,60 L25,60 L25,80 Z',
  wavy:
    'M0,30 C15,5 35,55 50,30 C65,5 85,55 100,30 L100,70 C85,95 65,45 50,70 C35,95 15,45 0,70 Z',
  'speech-round':
    'M50,5 C22,5 5,22 5,42 C5,58 16,72 32,78 L24,95 L46,80 C47,80 48,80 50,80 C78,80 95,63 95,42 C95,22 78,5 50,5 Z',
  'speech-rect':
    'M5,8 L95,8 L95,72 L42,72 L24,92 L24,72 L5,72 Z',
  checkmark: 'M10,52 L38,80 L90,18 L78,8 L38,58 L22,42 Z',
  blob: 'M50,4 C72,6 90,22 94,44 C98,66 88,86 70,93 C52,100 30,96 18,82 C6,68 4,46 14,28 C24,10 38,2 50,4 Z',
  leaf: 'M50,4 C76,12 92,36 88,62 C84,84 64,94 50,94 C36,94 16,84 12,62 C8,36 24,12 50,4 Z',
};

const PATH_OFFSETS: Partial<Record<ShapeInstance['type'], { x: number; y: number }>> = {
  arrow: { x: 50, y: 50 },
  heart: { x: 50, y: 50 },
  cloud: { x: 50, y: 40 },
  chevron: { x: 50, y: 50 },
  'double-arrow': { x: 50, y: 50 },
  wavy: { x: 50, y: 50 },
  'speech-round': { x: 50, y: 45 },
  'speech-rect': { x: 50, y: 45 },
  checkmark: { x: 50, y: 50 },
  blob: { x: 50, y: 50 },
  leaf: { x: 50, y: 50 },
};

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

  const pathData = SHAPE_PATHS[shape.type];
  const pathOffset = PATH_OFFSETS[shape.type];

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

      {shape.type === 'rounded-rect' && (
        <Rect
          ref={shapeRef as React.RefObject<Konva.Rect>}
          {...commonProps}
          width={shape.width}
          height={shape.height}
          offsetX={shape.width / 2}
          offsetY={shape.height / 2}
          cornerRadius={shape.cornerRadius ?? 32}
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

      {shape.type === 'ellipse' && (
        <Ellipse
          ref={shapeRef as React.RefObject<Konva.Ellipse>}
          {...commonProps}
          radiusX={shape.width / 2}
          radiusY={shape.height / 2}
        />
      )}

      {shape.type === 'ring' && (
        <Ring
          ref={shapeRef as React.RefObject<Konva.Ring>}
          {...commonProps}
          innerRadius={shape.width * 0.3}
          outerRadius={shape.width / 2}
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

      {shape.type === 'pentagon' && (
        <RegularPolygon
          ref={shapeRef as React.RefObject<Konva.RegularPolygon>}
          {...commonProps}
          sides={5}
          radius={shape.width / 2}
        />
      )}

      {shape.type === 'hexagon' && (
        <RegularPolygon
          ref={shapeRef as React.RefObject<Konva.RegularPolygon>}
          {...commonProps}
          sides={6}
          radius={shape.width / 2}
        />
      )}

      {shape.type === 'diamond' && (
        <RegularPolygon
          ref={shapeRef as React.RefObject<Konva.RegularPolygon>}
          {...commonProps}
          sides={4}
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

      {shape.type === 'sparkle' && (
        <Star
          ref={shapeRef as React.RefObject<Konva.Star>}
          {...commonProps}
          numPoints={4}
          innerRadius={shape.width / 10}
          outerRadius={shape.width / 2}
        />
      )}

      {pathData && pathOffset && (
        <Path
          ref={shapeRef as React.RefObject<Konva.Path>}
          {...commonProps}
          data={pathData}
          offsetX={pathOffset.x}
          offsetY={pathOffset.y}
          scaleX={(shape.width / PATH_VIEWBOX) * shape.scaleX}
          scaleY={(shape.height / PATH_VIEWBOX) * shape.scaleY}
        />
      )}

      {isSelected && (
        <Transformer
          ref={trRef}
          boundBoxFunc={(oldBox, newBox) => {
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

export const ShapePrimitive = memo(ShapePrimitiveInner, (prevProps, nextProps) => {
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
  if (prevShape.cornerRadius !== nextShape.cornerRadius) return false;

  if (prevProps.isSelected !== nextProps.isSelected) return false;
  if (prevProps.draggable !== nextProps.draggable) return false;

  return true;
});

ShapePrimitive.displayName = 'ShapePrimitive';
