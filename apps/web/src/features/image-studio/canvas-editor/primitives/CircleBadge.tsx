/**
 * CircleBadge - Reusable Konva component for rendering a colored circle with text lines
 *
 * Renders a circle with multiple text lines inside (e.g., weekday, date, time).
 * Designed for the Veranstaltung date circle but reusable across layouts.
 *
 * Features:
 * - Draggable with snapping support
 * - Transform handles (scale, rotate)
 * - Inline text editing on double-click per text line
 */

import { useRef, useCallback, useEffect, useState, memo } from 'react';
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
  onTextLineChange?: (lineIndex: number, text: string) => void;
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
  onTextLineChange,
  onSnapChange,
  onSnapLinesChange,
  getSnapTargets,
  stageWidth,
  stageHeight,
}: CircleBadgeProps) {
  const groupRef = useRef<Konva.Group>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const lastSnapRef = useRef({ h: false, v: false, linesCount: 0 });

  useEffect(() => {
    if (selected && editingIndex === null && groupRef.current && transformerRef.current) {
      transformerRef.current.nodes([groupRef.current]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [selected, editingIndex]);

  // Cleanup input on unmount
  useEffect(() => {
    return () => {
      if (inputRef.current && document.body.contains(inputRef.current)) {
        document.body.removeChild(inputRef.current);
      }
    };
  }, []);

  const handleDragMove = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      const node = e.target as Konva.Group;
      const scaleX = node.scaleX();
      const scaleY = node.scaleY();

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

    node.scaleX(scale);
    node.scaleY(scale);
    node.rotation(rotation);

    onTransformEnd(node.x(), node.y(), newScale, newRotation);
  }, [onTransformEnd, scale, rotation]);

  const handleDblClick = useCallback(
    (index: number, e: Konva.KonvaEventObject<Event>) => {
      if (!onTextLineChange) return;

      const textNode = e.target as Konva.Text;
      const stage = textNode.getStage();
      if (!stage) return;

      setEditingIndex(index);

      const stageBox = stage.container().getBoundingClientRect();
      const textPosition = textNode.getAbsolutePosition();
      const absScale = textNode.getAbsoluteScale();
      const scaleX = absScale.x;
      const scaleY = absScale.y;

      let input = inputRef.current;
      if (!input) {
        input = document.createElement('input');
        document.body.appendChild(input);
        inputRef.current = input;
      }

      const scrollX = window.scrollX || window.pageXOffset;
      const scrollY = window.scrollY || window.pageYOffset;

      const line = textLines[index];
      const lineHeight = 1.2;
      const textH = line.fontSize * lineHeight;

      input.value = line.text;
      input.style.position = 'absolute';
      input.style.top = `${stageBox.top + scrollY + textPosition.y}px`;
      input.style.left = `${stageBox.left + scrollX + textPosition.x}px`;
      input.style.width = `${radius * 2 * scaleX}px`;
      input.style.height = `${textH * scaleY}px`;
      input.style.fontSize = `${line.fontSize * scaleY}px`;
      input.style.fontFamily = `${line.fontFamily}, Arial, sans-serif`;
      input.style.fontWeight = line.fontWeight === 'bold' ? 'bold' : 'normal';
      input.style.color = textColor;
      input.style.textAlign = 'center';
      input.style.lineHeight = String(lineHeight);
      input.style.border = 'none';
      input.style.padding = '0px';
      input.style.margin = '0';
      input.style.background = 'none';
      input.style.outline = '2px solid #0088cc';
      input.style.outlineOffset = '2px';
      input.style.zIndex = '10000';
      input.style.transformOrigin = 'left top';

      input.focus();
      input.select();

      const removeInput = () => {
        if (!inputRef.current) return;

        const newText = inputRef.current.value.trim();
        if (newText && newText !== line.text) {
          onTextLineChange(index, newText);
        }

        setEditingIndex(null);

        if (document.body.contains(inputRef.current)) {
          document.body.removeChild(inputRef.current);
        }
        inputRef.current = null;
      };

      input.addEventListener('blur', removeInput);
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') {
          input?.blur();
        }
        if (ev.key === 'Enter' && !ev.shiftKey) {
          ev.preventDefault();
          input?.blur();
        }
      });
    },
    [onTextLineChange, textLines, textColor, radius]
  );

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
        draggable={editingIndex === null}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        onTransformEnd={handleTransformEnd}
        onClick={onSelect}
        onTap={onSelect}
      >
        {/* Circle background */}
        <Circle x={0} y={0} radius={radius} fill={backgroundColor} />

        {/* Text lines centered in circle */}
        {textLines.map((line, index) => {
          const isEditingThis = editingIndex === index;
          return (
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
              listening={!!onTextLineChange}
              visible={!isEditingThis}
              onDblClick={(e) => handleDblClick(index, e)}
              onDblTap={(e) => handleDblClick(index, e)}
            />
          );
        })}

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

      {selected && editingIndex === null && (
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

  return true;
});

CircleBadge.displayName = 'CircleBadge';

export default CircleBadge;
