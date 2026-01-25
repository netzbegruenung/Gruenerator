/**
 * CircleBadge - Reusable Konva component for rendering a colored circle with text lines
 *
 * Renders a circle with multiple text lines inside (e.g., weekday, date, time).
 * Designed for the Veranstaltung date circle but reusable across layouts.
 */

import { useRef, useCallback, useEffect, memo } from 'react';
import { Group, Circle, Text, Rect, Transformer } from 'react-konva';

import { calculateElementSnapPosition } from '../utils/snapping';

import type { SnapTarget } from '../utils/snapping';
import type Konva from 'konva';

export interface CircleBadgeTextLine {
  text: string;
  yOffset: number;
  fontFamily: string;
  fontSize: number;
  fontWeight?: 'normal' | 'bold';
}

export interface CircleBadgeInstance {
  id: string;
  x: number;
  y: number;
  radius: number;
  backgroundColor: string;
  textColor: string;
  rotation: number;
  scale: number;
  opacity?: number;
  textLines: CircleBadgeTextLine[];
}

export interface CircleBadgeProps {
  id: string;
  x: number;
  y: number;
  radius: number;
  backgroundColor: string;
  textColor: string;
  rotation: number;
  scale: number;
  opacity?: number;
  textLines: CircleBadgeTextLine[];
  selected: boolean;
  onSelect: () => void;
  onDragEnd: (x: number, y: number) => void;
  onTransformEnd: (x: number, y: number, scale: number, rotation: number) => void;
  onSnapChange: (snapH: boolean, snapV: boolean) => void;
  onSnapLinesChange: (lines: unknown[]) => void;
  getSnapTargets: (excludeId: string) => unknown[];
  stageWidth: number;
  stageHeight: number;
}

function CircleBadgeInner({
  id,
  x,
  y,
  radius,
  backgroundColor,
  textColor,
  rotation,
  scale,
  opacity = 1,
  textLines,
  selected,
  onSelect,
  onDragEnd,
  onTransformEnd,
  onSnapChange,
  onSnapLinesChange,
  getSnapTargets,
  stageWidth,
  stageHeight,
}: CircleBadgeProps) {
  const groupRef = useRef<Konva.Group>(null);
  const transformerRef = useRef<Konva.Transformer>(null);

  // Track last snap state to avoid redundant updates
  const lastSnapRef = useRef({ h: false, v: false, linesCount: 0 });

  // Attach transformer when selected
  useEffect(() => {
    if (selected && groupRef.current && transformerRef.current) {
      transformerRef.current.nodes([groupRef.current]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [selected]);

  const handleDragMove = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      const node = e.target as Konva.Group;
      const scaleX = node.scaleX();
      const scaleY = node.scaleY();

      // The content bounds are the circle bounds
      const contentWidth = radius * 2 * scaleX;
      const contentHeight = radius * 2 * scaleY;
      const currentAbsX = node.x() - contentWidth / 2;
      const currentAbsY = node.y() - contentHeight / 2;

      const result = calculateElementSnapPosition(
        currentAbsX,
        currentAbsY,
        contentWidth,
        contentHeight,
        getSnapTargets(id) as unknown as SnapTarget[],
        stageWidth,
        stageHeight
      );

      node.position({ x: result.x + contentWidth / 2, y: result.y + contentHeight / 2 });

      // Only update snap state if it actually changed
      const snapChanged =
        lastSnapRef.current.h !== result.snapH || lastSnapRef.current.v !== result.snapV;
      const linesChanged = lastSnapRef.current.linesCount !== result.snapLines.length;

      if (snapChanged || linesChanged) {
        lastSnapRef.current = {
          h: result.snapH,
          v: result.snapV,
          linesCount: result.snapLines.length,
        };
        onSnapChange(result.snapH, result.snapV);
        onSnapLinesChange(result.snapLines);
      }
    },
    [id, radius, getSnapTargets, stageWidth, stageHeight, onSnapChange, onSnapLinesChange]
  );

  const handleDragEnd = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      onSnapChange(false, false);
      onSnapLinesChange([]);
      onDragEnd(e.target.x(), e.target.y());
    },
    [onDragEnd, onSnapChange, onSnapLinesChange]
  );

  const handleTransformEnd = useCallback(() => {
    const node = groupRef.current;
    if (!node) return;

    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    const newScale = Math.max(scaleX, scaleY);
    const newRotation = node.rotation();

    // Reset node scale to 1 since we track scale in state
    node.scaleX(scale);
    node.scaleY(scale);
    node.rotation(rotation);

    onTransformEnd(node.x(), node.y(), newScale, newRotation);
  }, [onTransformEnd, scale, rotation]);

  return (
    <>
      <Group
        ref={groupRef}
        x={x}
        y={y}
        scaleX={scale}
        scaleY={scale}
        rotation={rotation}
        opacity={opacity}
        draggable
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        onTransformEnd={handleTransformEnd}
        onClick={onSelect}
        onTap={onSelect}
      >
        {/* Circle background */}
        <Circle x={0} y={0} radius={radius} fill={backgroundColor} />

        {/* Text lines centered in circle */}
        {textLines.map((line, index) => (
          <Text
            key={index}
            text={line.text}
            x={-radius}
            y={line.yOffset - line.fontSize / 2}
            width={radius * 2}
            fontSize={line.fontSize}
            fontFamily={`${line.fontFamily}, Arial, sans-serif`}
            fontStyle={line.fontWeight === 'bold' ? 'bold' : 'normal'}
            fill={textColor}
            align="center"
            listening={false}
          />
        ))}

        {/* Selection indicator */}
        {selected && (
          <Rect
            x={-radius - 4}
            y={-radius - 4}
            width={radius * 2 + 8}
            height={radius * 2 + 8}
            stroke="#0066ff"
            strokeWidth={2}
            dash={[5, 5]}
            listening={false}
          />
        )}
      </Group>

      {selected && (
        <Transformer
          ref={transformerRef}
          keepRatio={true}
          enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
          boundBoxFunc={(oldBox, newBox) => {
            const minSize = 50;
            const maxSize = 2000;
            if (newBox.width < minSize || newBox.height < minSize) return oldBox;
            if (newBox.width > maxSize || newBox.height > maxSize) return oldBox;
            return newBox;
          }}
        />
      )}
    </>
  );
}

/**
 * Memoized CircleBadge - Prevents re-renders when only callbacks change
 */
export const CircleBadge = memo(CircleBadgeInner, (prevProps, nextProps) => {
  // Compare data props - if any change, re-render
  if (prevProps.id !== nextProps.id) return false;
  if (prevProps.x !== nextProps.x) return false;
  if (prevProps.y !== nextProps.y) return false;
  if (prevProps.radius !== nextProps.radius) return false;
  if (prevProps.backgroundColor !== nextProps.backgroundColor) return false;
  if (prevProps.textColor !== nextProps.textColor) return false;
  if (prevProps.rotation !== nextProps.rotation) return false;
  if (prevProps.scale !== nextProps.scale) return false;
  if (prevProps.opacity !== nextProps.opacity) return false;
  if (prevProps.selected !== nextProps.selected) return false;
  if (prevProps.stageWidth !== nextProps.stageWidth) return false;
  if (prevProps.stageHeight !== nextProps.stageHeight) return false;

  // Compare textLines array
  if (prevProps.textLines.length !== nextProps.textLines.length) return false;
  for (let i = 0; i < prevProps.textLines.length; i++) {
    const prev = prevProps.textLines[i];
    const next = nextProps.textLines[i];
    if (prev.text !== next.text) return false;
    if (prev.yOffset !== next.yOffset) return false;
    if (prev.fontSize !== next.fontSize) return false;
    if (prev.fontFamily !== next.fontFamily) return false;
    if (prev.fontWeight !== next.fontWeight) return false;
  }

  // Callbacks are considered stable
  return true;
});

CircleBadge.displayName = 'CircleBadge';

export default CircleBadge;
