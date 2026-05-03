import React, { useRef, useEffect, useState, useCallback, memo } from 'react';
import { Circle, Group, Image as KonvaImage, Line, Rect, Shape, Transformer } from 'react-konva';

import { assertNever } from '../utils/shapes';

import type { FrameClipType, FrameInstance } from '../utils/frameUtils';
import type Konva from 'konva';
import type { Context, SceneContext } from 'konva/lib/Context';

/**
 * Plot the silhouette path for the given clip-type into the canvas context.
 * Caller (Konva.Group clipFunc, or the SVG mini-preview) wraps with fill/clip.
 * Coordinates are in the frame's local 0..w × 0..h space.
 *
 * The `assertNever` default turns any new FrameClipType added without a path
 * here into a compile error — same exhaustiveness pattern as ShapePrimitive.
 */
function drawFramePath(
  ctx: CanvasRenderingContext2D | Context,
  clipType: FrameClipType,
  w: number,
  h: number,
  cornerRadius: number
) {
  switch (clipType) {
    case 'circle': {
      const radius = Math.min(w, h) / 2;
      ctx.arc(w / 2, h / 2, radius, 0, Math.PI * 2);
      return;
    }
    case 'rounded-rect': {
      const r = cornerRadius;
      ctx.moveTo(r, 0);
      ctx.arcTo(w, 0, w, h, r);
      ctx.arcTo(w, h, 0, h, r);
      ctx.arcTo(0, h, 0, 0, r);
      ctx.arcTo(0, 0, w, 0, r);
      ctx.closePath();
      return;
    }
    case 'square': {
      ctx.rect(0, 0, w, h);
      return;
    }
    case 'oval': {
      ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      return;
    }
    case 'hexagon': {
      regularPolygonPath(ctx, w, h, 6, -Math.PI / 2);
      return;
    }
    case 'diamond': {
      ctx.moveTo(w / 2, 0);
      ctx.lineTo(w, h / 2);
      ctx.lineTo(w / 2, h);
      ctx.lineTo(0, h / 2);
      ctx.closePath();
      return;
    }
    case 'drop': {
      const cx = w / 2;
      ctx.moveTo(cx, 0);
      ctx.bezierCurveTo(cx + w * 0.4, h * 0.25, w, h * 0.45, w, h * 0.6);
      ctx.arc(cx, h * 0.6, w / 2, 0, Math.PI);
      ctx.bezierCurveTo(0, h * 0.45, cx - w * 0.4, h * 0.25, cx, 0);
      ctx.closePath();
      return;
    }
    case 'leaf': {
      ctx.moveTo(0, h);
      ctx.bezierCurveTo(0, h * 0.3, w * 0.3, 0, w, 0);
      ctx.bezierCurveTo(w, h * 0.7, w * 0.7, h, 0, h);
      ctx.closePath();
      return;
    }
    case 'triangle': {
      ctx.moveTo(w / 2, 0);
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      return;
    }
    case 'pentagon': {
      regularPolygonPath(ctx, w, h, 5, -Math.PI / 2);
      return;
    }
    case 'octagon': {
      regularPolygonPath(ctx, w, h, 8, -Math.PI / 2 - Math.PI / 8);
      return;
    }
    case 'star': {
      starPath(ctx, w, h, 5);
      return;
    }
    case 'heart': {
      const top = h * 0.18;
      ctx.moveTo(w / 2, h);
      ctx.bezierCurveTo(-w * 0.05, h * 0.7, w * 0.1, top, w / 2, h * 0.32);
      ctx.bezierCurveTo(w * 0.9, top, w * 1.05, h * 0.7, w / 2, h);
      ctx.closePath();
      return;
    }
    case 'cloud': {
      ctx.moveTo(w * 0.14, h * 0.78);
      ctx.bezierCurveTo(0, h * 0.78, 0, h * 0.45, w * 0.18, h * 0.4);
      ctx.bezierCurveTo(w * 0.18, h * 0.1, w * 0.55, h * 0.05, w * 0.62, h * 0.32);
      ctx.bezierCurveTo(w * 0.78, h * 0.12, w, h * 0.3, w, h * 0.55);
      ctx.bezierCurveTo(w, h * 0.85, w * 0.78, h * 0.92, w * 0.62, h * 0.78);
      ctx.bezierCurveTo(w * 0.5, h * 0.95, w * 0.25, h * 0.95, w * 0.14, h * 0.78);
      ctx.closePath();
      return;
    }
    case 'blob': {
      ctx.moveTo(w * 0.5, 0);
      ctx.bezierCurveTo(w * 0.85, h * 0.05, w, h * 0.4, w * 0.92, h * 0.6);
      ctx.bezierCurveTo(w * 0.85, h * 0.9, w * 0.55, h, w * 0.32, h * 0.96);
      ctx.bezierCurveTo(w * 0.05, h * 0.85, 0, h * 0.5, w * 0.08, h * 0.28);
      ctx.bezierCurveTo(w * 0.18, h * 0.1, w * 0.32, 0, w * 0.5, 0);
      ctx.closePath();
      return;
    }
    case 'arch': {
      const r = Math.min(w / 2, h * 0.45);
      ctx.moveTo(0, h);
      ctx.lineTo(0, r);
      ctx.arc(w / 2, r, r, Math.PI, 0);
      ctx.lineTo(w, h);
      ctx.closePath();
      return;
    }
    case 'speech-bubble': {
      const r = Math.min(w, h) * 0.08;
      const bodyH = h * 0.78;
      ctx.moveTo(r, 0);
      ctx.arcTo(w, 0, w, bodyH, r);
      ctx.arcTo(w, bodyH, 0, bodyH, r);
      ctx.lineTo(w * 0.42, bodyH);
      ctx.lineTo(w * 0.22, h);
      ctx.lineTo(w * 0.28, bodyH);
      ctx.arcTo(0, bodyH, 0, 0, r);
      ctx.arcTo(0, 0, w, 0, r);
      ctx.closePath();
      return;
    }
    case 'banner-tag': {
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w * 0.22, 0);
      ctx.lineTo(w, 0);
      ctx.lineTo(w, h);
      ctx.lineTo(w * 0.22, h);
      ctx.closePath();
      return;
    }
    case 'ribbon': {
      const tail = w * 0.12;
      ctx.moveTo(0, h * 0.25);
      ctx.lineTo(tail, h / 2);
      ctx.lineTo(0, h * 0.75);
      ctx.lineTo(tail, h * 0.75);
      ctx.lineTo(tail, h);
      ctx.lineTo(w - tail, h);
      ctx.lineTo(w - tail, h * 0.75);
      ctx.lineTo(w, h * 0.75);
      ctx.lineTo(w - tail, h / 2);
      ctx.lineTo(w, h * 0.25);
      ctx.lineTo(w - tail, h * 0.25);
      ctx.lineTo(w - tail, 0);
      ctx.lineTo(tail, 0);
      ctx.lineTo(tail, h * 0.25);
      ctx.closePath();
      return;
    }
    case 'ring': {
      // Annulus: outer CCW + inner CW. Konva's clipFunc fills with nonzero
      // winding rule by default — opposite-winding subpaths produce a hole.
      const cx = w / 2;
      const cy = h / 2;
      const outerR = Math.min(w, h) / 2;
      const innerR = outerR * 0.55;
      ctx.moveTo(cx + outerR, cy);
      ctx.arc(cx, cy, outerR, 0, Math.PI * 2, false);
      ctx.moveTo(cx + innerR, cy);
      ctx.arc(cx, cy, innerR, 0, Math.PI * 2, true);
      return;
    }
    default:
      return assertNever(clipType);
  }
}

/** Inscribe a regular n-gon in 0..w × 0..h, starting at `startAngle` (radians). */
function regularPolygonPath(
  ctx: CanvasRenderingContext2D | Context,
  w: number,
  h: number,
  sides: number,
  startAngle: number
) {
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) / 2;
  for (let i = 0; i < sides; i++) {
    const angle = startAngle + ((Math.PI * 2) / sides) * i;
    const px = cx + r * Math.cos(angle);
    const py = cy + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/** Plot an n-point star inscribed in 0..w × 0..h. Inner radius is ~half outer. */
function starPath(
  ctx: CanvasRenderingContext2D | Context,
  w: number,
  h: number,
  numPoints: number
) {
  const cx = w / 2;
  const cy = h / 2;
  const outerR = Math.min(w, h) / 2;
  const innerR = outerR * 0.45;
  const step = Math.PI / numPoints;
  for (let i = 0; i < numPoints * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = -Math.PI / 2 + step * i;
    const px = cx + r * Math.cos(angle);
    const py = cy + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

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

  // Attach transformer when selected. Deps deliberately narrow: re-running
  // on every frame field change made Konva fire phantom transform events.
  useEffect(() => {
    if (isSelected && trRef.current && groupRef.current) {
      trRef.current.nodes([groupRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    const rotation = node.rotation();
    const nodeW = node.width();
    const nodeH = node.height();

    const SCALE_EPSILON = 0.001;
    const ROTATION_EPSILON = 0.01;
    const isPhantom =
      Math.abs(scaleX - 1) < SCALE_EPSILON &&
      Math.abs(scaleY - 1) < SCALE_EPSILON &&
      Math.abs(nodeW - frame.width) < SCALE_EPSILON &&
      Math.abs(nodeH - frame.height) < SCALE_EPSILON &&
      Math.abs(rotation - frame.rotation) < ROTATION_EPSILON;

    // Always reset node scale to 1 — even on phantom — so the Konva node and
    // React state stay in sync. Konva's keepRatio measures the bbox aspect
    // (which drifts from 1:1 due to border strokes) so we enforce a single
    // uniform scale ourselves to guarantee the frame's aspect ratio survives.
    node.scaleX(1);
    node.scaleY(1);

    if (isPhantom) return;

    const uniformScale = (scaleX + scaleY) / 2;
    onChange({
      x: node.x(),
      y: node.y(),
      rotation,
      width: Math.max(20, frame.width * uniformScale),
      height: Math.max(20, frame.height * uniformScale),
      scaleX: 1,
      scaleY: 1,
    });
  }, [onChange, frame.width, frame.height, frame.rotation]);

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
      drawFramePath(ctx, frame.clipType, w, h, frame.cornerRadius);
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
        width={w}
        height={h}
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
              {/* Empty placeholder: soft fill + Canva-style image glyph */}
              <Rect x={0} y={0} width={w} height={h} fill="#f3f4f6" />
              {(() => {
                const glyphScale = Math.min(w, h) * 0.3;
                const cx = w / 2;
                const cy = h / 2;
                return (
                  <Group x={cx} y={cy} listening={false}>
                    {/* Mountain ridge */}
                    <Line
                      points={[
                        -glyphScale,
                        glyphScale * 0.4,
                        -glyphScale * 0.35,
                        -glyphScale * 0.25,
                        glyphScale * 0.1,
                        glyphScale * 0.15,
                        glyphScale * 0.55,
                        -glyphScale * 0.45,
                        glyphScale,
                        glyphScale * 0.4,
                      ]}
                      stroke="#9ca3af"
                      strokeWidth={Math.max(2, glyphScale * 0.05)}
                      lineJoin="round"
                      lineCap="round"
                    />
                    {/* Sun */}
                    <Circle
                      x={-glyphScale * 0.5}
                      y={-glyphScale * 0.45}
                      radius={glyphScale * 0.15}
                      fill="#9ca3af"
                    />
                  </Group>
                );
              })()}
            </>
          )}
        </Group>

        {/* Border stroke (outside clip) */}
        {frame.borderWidth > 0 && (
          <Shape
            sceneFunc={(ctx, shape) => {
              ctx.beginPath();
              drawFramePath(ctx, frame.clipType, w, h, frame.cornerRadius);
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
              drawFramePath(ctx, frame.clipType, w, h, frame.cornerRadius);
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
          enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
          keepRatio={true}
          boundBoxFunc={(oldBox, newBox) => {
            // Konva's keepRatio uses the bbox aspect (which includes stroke
            // width drift), so during the live drag the frame can flash a
            // wrong aspect ratio before we normalize on transformend. Enforce
            // uniform scaling here: pick whichever axis the user pulled
            // *more* (proportionally) and lock the other to it.
            const wScale = newBox.width / oldBox.width;
            const hScale = newBox.height / oldBox.height;
            const masterScale =
              Math.abs(wScale - 1) > Math.abs(hScale - 1) ? wScale : hScale;
            const adjustedWidth = oldBox.width * masterScale;
            const adjustedHeight = oldBox.height * masterScale;
            if (adjustedWidth < 20 || adjustedHeight < 20) {
              return oldBox;
            }
            return {
              ...newBox,
              width: adjustedWidth,
              height: adjustedHeight,
            };
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
