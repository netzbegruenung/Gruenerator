import React, { useRef, useEffect, useState, memo } from 'react';
import {
  Rect,
  Circle,
  RegularPolygon,
  Star,
  Path,
  Ellipse,
  Ring,
  Line,
  Arrow,
  Transformer,
} from 'react-konva';

import { assertNever, type ShapeInstance } from '../utils/shapes';
import { gradientToKonvaProps } from '../utils/gradientFill';

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

/** Subset of ShapeType rendered via Konva.Path with a hand-tuned SVG path. */
type PathShapeType =
  | 'arrow'
  | 'arrow-curved'
  | 'heart'
  | 'cloud'
  | 'chevron'
  | 'double-arrow'
  | 'wavy'
  | 'speech-round'
  | 'speech-rect'
  | 'speech-cloud'
  | 'speech-pointed'
  | 'cloud-fluffy'
  | 'cloud-puff'
  | 'cloud-thin'
  | 'heart-broken'
  | 'heart-double'
  | 'heart-arrow'
  | 'drop'
  | 'drop-pin'
  | 'drop-tear'
  | 'drop-flame'
  | 'banner-ribbon'
  | 'banner-flag'
  | 'banner-tag'
  | 'banner-scroll'
  | 'gear'
  | 'plus'
  | 'minus'
  | 'x-mark'
  | 'tree'
  | 'mountain'
  | 'blob-2'
  | 'checkmark'
  | 'blob'
  | 'leaf';

const SHAPE_PATHS: Record<PathShapeType, string> = {
  arrow: 'M0,20 L50,20 L50,0 L100,50 L50,100 L50,80 L0,80 Z',
  heart: 'M50,90 C50,90 10,70 10,40 C10,15 30,5 50,30 C70,5 90,15 90,40 C90,70 50,90 50,90 Z',
  cloud:
    'M25,60 C10,60 0,50 0,35 C0,20 15,10 25,15 C30,5 45,0 60,5 C75,10 80,20 80,25 C90,25 100,35 100,50 C100,65 85,75 70,70 C60,80 35,80 25,60 Z',
  chevron: 'M20,10 L40,10 L80,50 L40,90 L20,90 L60,50 Z',
  'double-arrow': 'M0,50 L25,20 L25,40 L75,40 L75,20 L100,50 L75,80 L75,60 L25,60 L25,80 Z',
  wavy: 'M0,30 C15,5 35,55 50,30 C65,5 85,55 100,30 L100,70 C85,95 65,45 50,70 C35,95 15,45 0,70 Z',
  'speech-round':
    'M50,5 C22,5 5,22 5,42 C5,58 16,72 32,78 L24,95 L46,80 C47,80 48,80 50,80 C78,80 95,63 95,42 C95,22 78,5 50,5 Z',
  'speech-rect': 'M5,8 L95,8 L95,72 L42,72 L24,92 L24,72 L5,72 Z',
  'speech-cloud':
    'M50,8 C28,8 12,22 12,40 C12,52 18,60 28,66 L24,82 L42,68 C45,69 48,70 50,70 C72,70 88,56 88,40 C88,22 72,8 50,8 Z M22,84 C20,84 19,87 21,88 C23,89 25,87 24,85 Z M14,93 C13,93 12,95 13,96 C15,97 17,95 16,94 Z',
  'speech-pointed': 'M5,8 L95,8 L95,68 L60,68 L72,90 L40,68 L5,68 Z',
  'cloud-fluffy':
    'M30,55 C20,55 12,48 14,38 C16,28 28,26 34,32 C36,20 52,16 62,28 C68,20 82,22 84,36 C92,38 94,50 86,56 C92,62 88,72 78,70 C72,76 60,76 56,70 C46,76 36,76 32,70 C24,76 16,70 22,62 C14,62 18,55 30,55 Z',
  'heart-broken':
    'M50,90 C50,90 10,70 10,40 C10,15 30,5 50,30 L42,42 L52,50 L42,62 L50,90 Z M50,90 L60,62 L50,50 L60,42 L50,30 C70,5 90,15 90,40 C90,70 50,90 50,90 Z',
  'heart-double':
    'M28,72 C28,72 4,58 4,32 C4,12 22,2 30,20 C38,2 56,12 56,32 C56,58 28,72 28,72 Z M68,72 C68,72 44,58 44,32 C44,12 62,2 70,20 C78,2 96,12 96,32 C96,58 68,72 68,72 Z',
  drop: 'M50,5 C50,5 70,30 80,55 C85,75 70,92 50,92 C30,92 15,75 20,55 C30,30 50,5 50,5 Z',
  'banner-ribbon': 'M5,30 L75,30 L95,50 L75,70 L5,70 L20,50 Z',
  'banner-flag': 'M10,8 L10,92 L14,92 L14,55 L88,38 L14,18 Z',
  gear: 'M50,5 L57,12 L62,8 L67,18 L80,15 L82,28 L92,33 L88,42 L95,50 L88,58 L92,67 L82,72 L80,85 L67,82 L62,92 L57,88 L50,95 L43,88 L38,92 L33,82 L20,85 L18,72 L8,67 L12,58 L5,50 L12,42 L8,33 L18,28 L20,15 L33,18 L38,8 L43,12 Z',
  plus: 'M40,5 L60,5 L60,40 L95,40 L95,60 L60,60 L60,95 L40,95 L40,60 L5,60 L5,40 L40,40 Z',
  checkmark: 'M10,52 L38,80 L90,18 L78,8 L38,58 L22,42 Z',
  blob: 'M50,4 C72,6 90,22 94,44 C98,66 88,86 70,93 C52,100 30,96 18,82 C6,68 4,46 14,28 C24,10 38,2 50,4 Z',
  'blob-2':
    'M52,6 C75,12 95,28 92,52 C90,72 75,90 52,92 C32,93 12,82 8,62 C4,42 18,18 30,12 C38,8 45,5 52,6 Z',
  leaf: 'M50,4 C76,12 92,36 88,62 C84,84 64,94 50,94 C36,94 16,84 12,62 C8,36 24,12 50,4 Z',
  'arrow-curved': 'M8,72 C8,42 32,22 60,28 L60,16 L92,38 L60,60 L60,48 C42,46 26,58 26,72 Z',
  'cloud-puff':
    'M22,60 C8,60 5,45 18,38 C18,22 38,18 48,30 C58,18 78,22 78,40 C92,40 92,58 78,62 C78,72 60,72 56,66 C50,72 30,72 22,60 Z',
  'cloud-thin':
    'M5,55 C5,40 22,30 32,40 C36,30 50,28 58,38 C72,30 88,38 90,52 C95,55 95,65 85,65 L15,65 C5,65 5,58 5,55 Z',
  'heart-arrow':
    'M50,90 C50,90 12,68 12,38 C12,15 30,5 50,28 C70,5 88,15 88,38 C88,68 50,90 50,90 Z M0,46 L20,46 L20,38 L32,52 L20,66 L20,58 L0,58 Z M68,52 L80,52 L80,44 L100,58 L80,72 L80,64 L68,64 Z',
  'drop-pin': 'M50,5 C32,5 18,18 18,35 C18,55 50,92 50,92 C50,92 82,55 82,35 C82,18 68,5 50,5 Z',
  'drop-tear': 'M50,8 C42,28 28,52 32,70 C34,82 42,90 50,90 C58,90 66,82 68,70 C72,52 58,28 50,8 Z',
  'drop-flame':
    'M50,5 C45,18 35,28 38,42 C30,50 30,62 38,72 C32,75 32,82 38,88 C45,93 55,93 62,88 C68,82 68,75 62,72 C70,62 70,50 62,42 C65,28 55,18 50,5 Z',
  'banner-tag': 'M5,25 L70,25 L95,50 L70,75 L5,75 Z',
  'banner-scroll':
    'M0,42 C0,32 12,28 22,32 L22,68 C12,72 0,68 0,58 Z M22,28 L78,28 L78,72 L22,72 Z M78,32 C88,28 100,32 100,42 L100,58 C100,68 88,72 78,68 Z',
  tree: 'M40,72 L60,72 L60,90 L40,90 Z M50,8 L72,40 L62,40 L82,68 L66,68 L78,90 L22,90 L34,68 L18,68 L38,40 L28,40 Z',
  mountain: 'M5,82 L32,38 L48,58 L62,30 L95,82 Z',
  minus: 'M5,42 L95,42 L95,58 L5,58 Z',
  'x-mark': 'M14,5 L50,40 L86,5 L95,14 L60,50 L95,86 L86,95 L50,60 L14,95 L5,86 L40,50 L5,14 Z',
};

const PATH_OFFSETS: Record<PathShapeType, { x: number; y: number }> = {
  arrow: { x: 50, y: 50 },
  heart: { x: 50, y: 50 },
  cloud: { x: 50, y: 40 },
  chevron: { x: 50, y: 50 },
  'double-arrow': { x: 50, y: 50 },
  wavy: { x: 50, y: 50 },
  'speech-round': { x: 50, y: 45 },
  'speech-rect': { x: 50, y: 45 },
  'speech-cloud': { x: 50, y: 45 },
  'speech-pointed': { x: 50, y: 45 },
  'cloud-fluffy': { x: 50, y: 50 },
  'heart-broken': { x: 50, y: 50 },
  'heart-double': { x: 50, y: 40 },
  drop: { x: 50, y: 50 },
  'banner-ribbon': { x: 50, y: 50 },
  'banner-flag': { x: 50, y: 50 },
  gear: { x: 50, y: 50 },
  plus: { x: 50, y: 50 },
  checkmark: { x: 50, y: 50 },
  blob: { x: 50, y: 50 },
  'blob-2': { x: 50, y: 50 },
  leaf: { x: 50, y: 50 },
  'arrow-curved': { x: 50, y: 50 },
  'cloud-puff': { x: 50, y: 50 },
  'cloud-thin': { x: 50, y: 50 },
  'heart-arrow': { x: 50, y: 50 },
  'drop-pin': { x: 50, y: 50 },
  'drop-tear': { x: 50, y: 50 },
  'drop-flame': { x: 50, y: 50 },
  'banner-tag': { x: 50, y: 50 },
  'banner-scroll': { x: 50, y: 50 },
  tree: { x: 50, y: 50 },
  mountain: { x: 50, y: 60 },
  minus: { x: 50, y: 50 },
  'x-mark': { x: 50, y: 50 },
};

interface CommonShapeProps {
  x: number;
  y: number;
  fill: string;
  opacity: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  draggable: boolean;
  onClick: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onTap: (e: Konva.KonvaEventObject<TouchEvent>) => void;
  onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => void;
  onTransformEnd: () => void;
  name: string;
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  shadowOpacity?: number;
  fillPriority?: 'color' | 'linear-gradient';
  fillLinearGradientStartPoint?: { x: number; y: number };
  fillLinearGradientEndPoint?: { x: number; y: number };
  fillLinearGradientColorStops?: Array<number | string>;
}

function renderShape(
  shape: ShapeInstance,
  commonProps: CommonShapeProps,
  shapeRef: React.RefObject<Konva.Shape | null>
): React.ReactElement {
  switch (shape.type) {
    case 'rect':
      return (
        <Rect
          ref={shapeRef as React.RefObject<Konva.Rect>}
          {...commonProps}
          width={shape.width}
          height={shape.height}
          offsetX={shape.width / 2}
          offsetY={shape.height / 2}
        />
      );
    case 'rounded-rect':
      return (
        <Rect
          ref={shapeRef as React.RefObject<Konva.Rect>}
          {...commonProps}
          width={shape.width}
          height={shape.height}
          offsetX={shape.width / 2}
          offsetY={shape.height / 2}
          cornerRadius={shape.cornerRadius ?? 32}
        />
      );
    case 'circle':
      return (
        <Circle
          ref={shapeRef as React.RefObject<Konva.Circle>}
          {...commonProps}
          width={shape.width}
          height={shape.height}
          radius={shape.width / 2}
        />
      );
    case 'ellipse':
      return (
        <Ellipse
          ref={shapeRef as React.RefObject<Konva.Ellipse>}
          {...commonProps}
          radiusX={shape.width / 2}
          radiusY={shape.height / 2}
        />
      );
    case 'ring':
      return (
        <Ring
          ref={shapeRef as React.RefObject<Konva.Ring>}
          {...commonProps}
          innerRadius={shape.width * 0.3}
          outerRadius={shape.width / 2}
        />
      );
    case 'triangle':
      return (
        <RegularPolygon
          ref={shapeRef as React.RefObject<Konva.RegularPolygon>}
          {...commonProps}
          sides={3}
          radius={shape.width / 2}
        />
      );
    case 'pentagon':
      return (
        <RegularPolygon
          ref={shapeRef as React.RefObject<Konva.RegularPolygon>}
          {...commonProps}
          sides={5}
          radius={shape.width / 2}
        />
      );
    case 'hexagon':
      return (
        <RegularPolygon
          ref={shapeRef as React.RefObject<Konva.RegularPolygon>}
          {...commonProps}
          sides={6}
          radius={shape.width / 2}
        />
      );
    case 'diamond':
      return (
        <RegularPolygon
          ref={shapeRef as React.RefObject<Konva.RegularPolygon>}
          {...commonProps}
          sides={4}
          radius={shape.width / 2}
        />
      );
    case 'star':
      return (
        <Star
          ref={shapeRef as React.RefObject<Konva.Star>}
          {...commonProps}
          numPoints={5}
          innerRadius={shape.width / 4}
          outerRadius={shape.width / 2}
        />
      );
    case 'sparkle':
      return (
        <Star
          ref={shapeRef as React.RefObject<Konva.Star>}
          {...commonProps}
          numPoints={4}
          innerRadius={shape.width / 10}
          outerRadius={shape.width / 2}
        />
      );
    case 'asterisk':
      return (
        <Star
          ref={shapeRef as React.RefObject<Konva.Star>}
          {...commonProps}
          numPoints={6}
          innerRadius={shape.width / 12}
          outerRadius={shape.width / 2}
        />
      );
    case 'flower':
      return (
        <Star
          ref={shapeRef as React.RefObject<Konva.Star>}
          {...commonProps}
          numPoints={6}
          innerRadius={shape.width * 0.28}
          outerRadius={shape.width / 2}
        />
      );
    case 'flower-8':
      return (
        <Star
          ref={shapeRef as React.RefObject<Konva.Star>}
          {...commonProps}
          numPoints={8}
          innerRadius={shape.width * 0.3}
          outerRadius={shape.width / 2}
        />
      );
    case 'star-burst':
      return (
        <Star
          ref={shapeRef as React.RefObject<Konva.Star>}
          {...commonProps}
          numPoints={8}
          innerRadius={shape.width / 12}
          outerRadius={shape.width / 2}
        />
      );
    case 'sun':
      return (
        <Star
          ref={shapeRef as React.RefObject<Konva.Star>}
          {...commonProps}
          numPoints={12}
          innerRadius={shape.width * 0.32}
          outerRadius={shape.width / 2}
        />
      );
    case 'gear-12':
      return (
        <Star
          ref={shapeRef as React.RefObject<Konva.Star>}
          {...commonProps}
          numPoints={12}
          innerRadius={shape.width * 0.4}
          outerRadius={shape.width / 2}
        />
      );
    case 'gear-6':
      return (
        <Star
          ref={shapeRef as React.RefObject<Konva.Star>}
          {...commonProps}
          numPoints={6}
          innerRadius={shape.width * 0.36}
          outerRadius={shape.width / 2}
        />
      );
    case 'gear-fine':
      return (
        <Star
          ref={shapeRef as React.RefObject<Konva.Star>}
          {...commonProps}
          numPoints={20}
          innerRadius={shape.width * 0.42}
          outerRadius={shape.width / 2}
        />
      );
    case 'arrow':
    case 'arrow-curved':
    case 'heart':
    case 'cloud':
    case 'chevron':
    case 'double-arrow':
    case 'wavy':
    case 'speech-round':
    case 'speech-rect':
    case 'speech-cloud':
    case 'speech-pointed':
    case 'cloud-fluffy':
    case 'cloud-puff':
    case 'cloud-thin':
    case 'heart-broken':
    case 'heart-double':
    case 'heart-arrow':
    case 'drop':
    case 'drop-pin':
    case 'drop-tear':
    case 'drop-flame':
    case 'banner-ribbon':
    case 'banner-flag':
    case 'banner-tag':
    case 'banner-scroll':
    case 'gear':
    case 'plus':
    case 'minus':
    case 'x-mark':
    case 'tree':
    case 'mountain':
    case 'blob-2':
    case 'checkmark':
    case 'blob':
    case 'leaf': {
      const offset = PATH_OFFSETS[shape.type];
      return (
        <Path
          ref={shapeRef as React.RefObject<Konva.Path>}
          {...commonProps}
          data={SHAPE_PATHS[shape.type]}
          offsetX={offset.x}
          offsetY={offset.y}
          scaleX={(shape.width / PATH_VIEWBOX) * shape.scaleX}
          scaleY={(shape.height / PATH_VIEWBOX) * shape.scaleY}
        />
      );
    }
    case 'line':
    case 'line-thick':
    case 'line-dashed':
    case 'line-dotted':
      return (
        <Line
          ref={shapeRef as React.RefObject<Konva.Line>}
          {...commonProps}
          points={[-shape.width / 2, 0, shape.width / 2, 0]}
          stroke={shape.fill}
          strokeWidth={shape.strokeWidth ?? 6}
          dash={shape.dash}
          lineCap={shape.type === 'line-dotted' ? 'round' : 'butt'}
        />
      );
    case 'line-double':
      return (
        <Path
          ref={shapeRef as React.RefObject<Konva.Path>}
          {...commonProps}
          data={`M -${shape.width / 2},-6 L ${shape.width / 2},-6 M -${shape.width / 2},6 L ${shape.width / 2},6`}
          stroke={shape.fill}
          strokeWidth={shape.strokeWidth ?? 6}
        />
      );
    case 'line-arrow': {
      const sw = shape.strokeWidth ?? 6;
      return (
        <Arrow
          ref={shapeRef as React.RefObject<Konva.Arrow>}
          {...commonProps}
          points={[-shape.width / 2, 0, shape.width / 2, 0]}
          stroke={shape.fill}
          strokeWidth={sw}
          pointerLength={Math.max(16, sw * 2.5)}
          pointerWidth={Math.max(16, sw * 2.5)}
        />
      );
    }
    default:
      return assertNever(shape.type);
  }
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

  // Gradient fill is painted in the shape's local box. getSelfRect() gives the
  // correct box for both top-left (Rect) and center-origin (Circle/Star) shapes.
  const [gradientProps, setGradientProps] = useState<ReturnType<
    typeof gradientToKonvaProps
  > | null>(null);
  useEffect(() => {
    if (shape.fillGradient && shapeRef.current) {
      setGradientProps(gradientToKonvaProps(shape.fillGradient, shapeRef.current.getSelfRect()));
    } else {
      setGradientProps(null);
    }
  }, [shape.fillGradient, shape.type, shape.width, shape.height]);

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

    node.scaleX(1);
    node.scaleY(1);

    onChange({
      x: node.x(),
      y: node.y(),
      rotation: node.rotation(),
      width: Math.max(5, shape.width * scaleX),
      height: Math.max(5, shape.height * scaleY),
      scaleX: 1,
      scaleY: 1,
    });
  };

  const commonProps: CommonShapeProps = {
    x: shape.x,
    y: shape.y,
    fill: shape.fill,
    opacity: shape.opacity ?? 1,
    rotation: shape.rotation,
    scaleX: shape.scaleX,
    scaleY: shape.scaleY,
    draggable,
    onClick: (e) => {
      e.cancelBubble = true;
      onSelect(shape.id);
    },
    onTap: (e) => {
      e.cancelBubble = true;
      onSelect(shape.id);
    },
    onDragEnd: handleDragEnd,
    onTransformEnd: handleTransformEnd,
    name: `shape-${shape.id}`,
    shadowColor: shape.shadowColor,
    shadowBlur: shape.shadowBlur,
    shadowOffsetX: shape.shadowOffsetX,
    shadowOffsetY: shape.shadowOffsetY,
    shadowOpacity: shape.shadowOpacity,
    ...(gradientProps
      ? { ...gradientProps, fillPriority: 'linear-gradient' as const }
      : { fillPriority: 'color' as const }),
  };

  const transformerStroke =
    shape.fill === '#316049' || shape.fill === '#000000' ? '#ffffff' : '#316049';

  return (
    <>
      {renderShape(shape, commonProps, shapeRef)}

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
          rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
          rotationSnapTolerance={7}
          borderStroke={transformerStroke}
          anchorStroke={transformerStroke}
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
  if (prevShape.strokeWidth !== nextShape.strokeWidth) return false;
  if (prevShape.dash !== nextShape.dash) return false;
  if (prevShape.shadowColor !== nextShape.shadowColor) return false;
  if (prevShape.shadowBlur !== nextShape.shadowBlur) return false;
  if (prevShape.shadowOffsetX !== nextShape.shadowOffsetX) return false;
  if (prevShape.shadowOffsetY !== nextShape.shadowOffsetY) return false;
  if (prevShape.shadowOpacity !== nextShape.shadowOpacity) return false;
  if (prevShape.fillGradient !== nextShape.fillGradient) return false;

  if (prevProps.isSelected !== nextProps.isSelected) return false;
  if (prevProps.draggable !== nextProps.draggable) return false;

  return true;
});

ShapePrimitive.displayName = 'ShapePrimitive';
