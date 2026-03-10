/**
 * PillBadge - Reusable Konva component for rendering a pill-shaped badge with text
 *
 * Renders a rounded rectangle with centered text inside (e.g., "Wusstest du?").
 * Designed for the Slider template label but reusable across layouts.
 *
 * Features:
 * - Draggable with snapping support
 * - Transform handles (scale, rotate)
 * - Inline text editing on double-click
 * - Auto-resize based on text content
 */

import { useRef, useCallback, useEffect, useState, memo } from 'react';
import { Group, Rect, Text, Transformer } from 'react-konva';

import { calculatePillBadgeDimensions } from '../utils/pillBadgeUtils';
import { calculateElementSnapPosition } from '../utils/snapping';

import type { PillBadgeFontStyle } from '../utils/pillBadgeUtils';
import type { SnapTarget, SnapLine } from '../utils/snapping';
import type Konva from 'konva';

export interface PillBadgeProps {
  id: string;
  text: string;
  x: number;
  y: number;
  backgroundColor: string;
  textColor: string;
  fontSize: number;
  fontFamily: string;
  fontStyle: PillBadgeFontStyle;
  rotation: number;
  scale: number;
  opacity?: number;
  paddingX: number;
  paddingY: number;
  cornerRadius: number;
  selected: boolean;
  onSelect: () => void;
  onTextChange: (text: string) => void;
  onDragEnd: (x: number, y: number) => void;
  onTransformEnd: (x: number, y: number, scale: number, rotation: number) => void;
  onSnapChange: (snapH: boolean, snapV: boolean) => void;
  onSnapLinesChange: (lines: SnapLine[]) => void;
  getSnapTargets: (excludeId: string) => SnapTarget[];
  stageWidth: number;
  stageHeight: number;
  isFontAvailable?: boolean;
}

function PillBadgeInner({
  id,
  text,
  x,
  y,
  backgroundColor,
  textColor,
  fontSize,
  fontFamily,
  fontStyle,
  rotation,
  scale,
  opacity = 1,
  paddingX,
  paddingY,
  cornerRadius,
  selected,
  onSelect,
  onTextChange,
  onDragEnd,
  onTransformEnd,
  onSnapChange,
  onSnapLinesChange,
  getSnapTargets,
  stageWidth,
  stageHeight,
  isFontAvailable: _isFontAvailable,
}: PillBadgeProps) {
  const groupRef = useRef<Konva.Group>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const [isEditing, setIsEditing] = useState(false);

  const lastSnapRef = useRef({ h: false, v: false, linesCount: 0 });

  const dimensions = calculatePillBadgeDimensions(
    text,
    fontSize,
    fontFamily,
    fontStyle,
    paddingX,
    paddingY
  );

  useEffect(() => {
    if (selected && !isEditing && groupRef.current && transformerRef.current) {
      transformerRef.current.nodes([groupRef.current]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [selected, isEditing]);

  const handleDragMove = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      const node = e.target as Konva.Group;
      const scaleX = node.scaleX();
      const scaleY = node.scaleY();

      const contentWidth = dimensions.width * scaleX;
      const contentHeight = dimensions.height * scaleY;
      const currentAbsX = node.x();
      const currentAbsY = node.y();

      const result = calculateElementSnapPosition(
        currentAbsX,
        currentAbsY,
        contentWidth,
        contentHeight,
        getSnapTargets(id) as unknown as SnapTarget[],
        stageWidth,
        stageHeight
      );

      node.position({ x: result.x, y: result.y });

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
    [id, dimensions, getSnapTargets, stageWidth, stageHeight, onSnapChange, onSnapLinesChange]
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

  const handleDblClick = useCallback(() => {
    const group = groupRef.current;
    if (!group) return;

    const stage = group.getStage();
    if (!stage) return;

    setIsEditing(true);

    const stageBox = stage.container().getBoundingClientRect();
    const absolutePos = group.getAbsolutePosition();
    const stageScale = stage.scaleX();

    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);

    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;

    const scaledFontSize = fontSize * scale * stageScale;
    const scaledPaddingX = paddingX * scale * stageScale;
    const scaledPaddingY = paddingY * scale * stageScale;
    const scaledWidth = dimensions.width * scale * stageScale;

    textarea.value = text;
    textarea.style.position = 'absolute';
    textarea.style.top = `${stageBox.top + scrollY + absolutePos.y + scaledPaddingY}px`;
    textarea.style.left = `${stageBox.left + scrollX + absolutePos.x + scaledPaddingX}px`;
    textarea.style.width = `${scaledWidth - scaledPaddingX * 2}px`;
    textarea.style.height = `${scaledFontSize * 1.2}px`;
    textarea.style.fontSize = `${scaledFontSize}px`;
    textarea.style.fontFamily = `${fontFamily}, Arial, sans-serif`;
    textarea.style.fontStyle = fontStyle.includes('italic') ? 'italic' : 'normal';
    textarea.style.fontWeight = fontStyle.includes('bold') ? 'bold' : 'normal';
    textarea.style.color = textColor;
    textarea.style.textAlign = 'left';
    textarea.style.lineHeight = '1';
    textarea.style.border = 'none';
    textarea.style.padding = '0px';
    textarea.style.margin = '0';
    textarea.style.background = 'transparent';
    textarea.style.outline = '2px solid #0088cc';
    textarea.style.outlineOffset = '2px';
    textarea.style.borderRadius = '0';
    textarea.style.resize = 'none';
    textarea.style.overflow = 'hidden';
    textarea.style.zIndex = '10000';
    textarea.style.transformOrigin = 'left top';

    textarea.focus();
    textarea.select();

    const removeTextarea = () => {
      const newText = textarea.value.trim();
      if (newText && newText !== text) {
        onTextChange(newText);
      }
      setIsEditing(false);
      if (textarea.parentNode) {
        document.body.removeChild(textarea);
      }
    };

    textarea.addEventListener('blur', removeTextarea);

    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        textarea.value = text;
        textarea.blur();
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        textarea.blur();
      }
    });
  }, [
    text,
    fontSize,
    fontFamily,
    fontStyle,
    textColor,
    paddingX,
    paddingY,
    scale,
    dimensions,
    onTextChange,
  ]);

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
        draggable={!isEditing}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        onTransformEnd={handleTransformEnd}
        onClick={onSelect}
        onTap={onSelect}
        onDblClick={handleDblClick}
        onDblTap={handleDblClick}
        visible={!isEditing}
      >
        <Rect
          x={0}
          y={0}
          width={dimensions.width}
          height={dimensions.height}
          fill={backgroundColor}
          cornerRadius={cornerRadius}
        />

        <Text
          x={paddingX}
          y={paddingY}
          text={text}
          fontSize={fontSize}
          fontFamily={`${fontFamily}, Arial, sans-serif`}
          fontStyle={fontStyle}
          fill={textColor}
          align="left"
          listening={false}
        />

        {selected && !isEditing && (
          <Rect
            x={-4}
            y={-4}
            width={dimensions.width + 8}
            height={dimensions.height + 8}
            stroke="#0066ff"
            strokeWidth={2}
            dash={[5, 5]}
            listening={false}
          />
        )}
      </Group>

      {selected && !isEditing && (
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

export const PillBadge = memo(PillBadgeInner, (prevProps, nextProps) => {
  if (prevProps.id !== nextProps.id) return false;
  if (prevProps.text !== nextProps.text) return false;
  if (prevProps.x !== nextProps.x) return false;
  if (prevProps.y !== nextProps.y) return false;
  if (prevProps.backgroundColor !== nextProps.backgroundColor) return false;
  if (prevProps.textColor !== nextProps.textColor) return false;
  if (prevProps.fontSize !== nextProps.fontSize) return false;
  if (prevProps.fontFamily !== nextProps.fontFamily) return false;
  if (prevProps.fontStyle !== nextProps.fontStyle) return false;
  if (prevProps.rotation !== nextProps.rotation) return false;
  if (prevProps.scale !== nextProps.scale) return false;
  if (prevProps.opacity !== nextProps.opacity) return false;
  if (prevProps.paddingX !== nextProps.paddingX) return false;
  if (prevProps.paddingY !== nextProps.paddingY) return false;
  if (prevProps.cornerRadius !== nextProps.cornerRadius) return false;
  if (prevProps.selected !== nextProps.selected) return false;
  if (prevProps.stageWidth !== nextProps.stageWidth) return false;
  if (prevProps.stageHeight !== nextProps.stageHeight) return false;
  if (prevProps.isFontAvailable !== nextProps.isFontAvailable) return false;

  return true;
});

PillBadge.displayName = 'PillBadge';

export default PillBadge;
