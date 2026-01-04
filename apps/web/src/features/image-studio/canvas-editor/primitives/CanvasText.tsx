/**
 * CanvasText - Draggable, transformable, editable text layer
 *
 * Konva Best Practice for Font Size Changes:
 * - During transform: Only update Konva node visually (no React state)
 * - On transformEnd: Commit to state via callback
 * - This prevents re-renders during drag for smooth UX
 */

import { useRef, useEffect, useState, useCallback, memo } from 'react';
import { Text as KonvaText, Transformer } from 'react-konva';
import type Konva from 'konva';
import type { TransformConfig, TransformAnchor } from '@gruenerator/shared/canvas-editor';
import { calculateSnapPosition, calculateElementSnapPosition } from '../utils/snapping';
import type { SnapTarget, SnapLine } from '../utils/snapping';

export interface CanvasTextProps {
  id?: string;
  text: string;
  x: number;
  y: number;
  width?: number;
  fontSize?: number;
  fontFamily?: string;
  fontStyle?: 'normal' | 'italic' | 'bold' | 'bold italic';
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  align?: 'left' | 'center' | 'right';
  verticalAlign?: 'top' | 'middle' | 'bottom';
  lineHeight?: number;
  wrap?: 'word' | 'char' | 'none';
  padding?: number;
  draggable?: boolean;
  selected?: boolean;
  editable?: boolean;
  transformConfig?: Partial<TransformConfig>;
  onSelect?: () => void;
  onDeselect?: () => void;
  onTextChange?: (text: string) => void;
  onDragEnd?: (x: number, y: number) => void;
  onTransformEnd?: (x: number, y: number, width: number, scaleX: number, scaleY: number) => void;
  onFontSizeChange?: (fontSize: number) => void;
  snapToCenter?: boolean;
  stageWidth?: number;
  stageHeight?: number;
  onSnapChange?: (snapH: boolean, snapV: boolean) => void;
  snapTargets?: SnapTarget[];
  onPositionChange?: (id: string, x: number, y: number, width: number, height: number) => void;
  onSnapLinesChange?: (lines: SnapLine[]) => void;
}

const DEFAULT_TEXT_ANCHORS: TransformAnchor[] = ['middle-left', 'middle-right'];

function CanvasTextInner({
  id,
  text,
  x,
  y,
  width,
  fontSize = 24,
  fontFamily = 'Arial',
  fontStyle = 'normal',
  fill = '#000000',
  stroke,
  strokeWidth,
  align = 'left',
  verticalAlign = 'top',
  lineHeight = 1.2,
  wrap = 'word',
  padding = 0,
  draggable = true,
  selected = false,
  editable = false,
  transformConfig,
  onSelect,
  onDeselect,
  onTextChange,
  onDragEnd,
  onTransformEnd,
  onFontSizeChange,
  snapToCenter = false,
  stageWidth,
  stageHeight,
  onSnapChange,
  snapTargets,
  onPositionChange,
  onSnapLinesChange,
}: CanvasTextProps) {
  const textRef = useRef<Konva.Text>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (selected && trRef.current && textRef.current && !isEditing) {
      trRef.current.nodes([textRef.current]);
      trRef.current.getLayer()?.batchDraw();
    } else if (!selected && trRef.current) {
      trRef.current.nodes([]);
    }
  }, [selected, isEditing]);

  const handleDragEnd = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      const node = e.target as Konva.Text;
      const nodeWidth = node.width() * node.scaleX();
      const nodeHeight = node.height() * node.scaleY();

      onSnapChange?.(false, false);
      onSnapLinesChange?.([]);
      onDragEnd?.(node.x(), node.y());

      // Report final position to store only on drag end (not during drag for performance)
      if (id && onPositionChange) {
        onPositionChange(id, node.x(), node.y(), nodeWidth, nodeHeight);
      }
    },
    [id, onDragEnd, onSnapChange, onSnapLinesChange, onPositionChange]
  );

  const handleDragMove = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      // Note: Don't log every dragMove - too noisy. Uncomment if needed:
      // console.log(`[CanvasText ${id}] handleDragMove`);
      const node = e.target as Konva.Text;
      const nodeWidth = node.width() * node.scaleX();
      const nodeHeight = node.height() * node.scaleY();

      // NOTE: Don't call onPositionChange here - it causes React re-renders during drag
      // Position is reported only on dragEnd for performance (Konva best practice)

      if (!stageWidth || !stageHeight) return;

      // Use element snapping if targets provided, otherwise fall back to center-only
      if (snapTargets && snapTargets.length > 0) {
        const result = calculateElementSnapPosition(
          node.x(),
          node.y(),
          nodeWidth,
          nodeHeight,
          snapTargets,
          stageWidth,
          stageHeight
        );

        node.position({ x: result.x, y: result.y });
        onSnapChange?.(result.snapH, result.snapV);
        onSnapLinesChange?.(result.snapLines);
      } else if (snapToCenter) {
        const { x, y, snapH, snapV } = calculateSnapPosition(
          node.x(),
          node.y(),
          nodeWidth,
          nodeHeight,
          stageWidth,
          stageHeight
        );

        node.position({ x, y });
        onSnapChange?.(snapH, snapV);
      }
    },
    [snapToCenter, stageWidth, stageHeight, onSnapChange, snapTargets, onSnapLinesChange]
  );

  // Konva Best Practice: Let text visually scale during transform, convert to fontSize on transformEnd
  // This prevents the feedback loop of: scale→fontSize→rerender→scale again
  const handleTransform = useCallback(() => {
    // During transform: Do nothing - let Konva handle visual scaling
    // The text will appear scaled (not actual font size change) until transformEnd
  }, []);

  const handleTransformEnd = useCallback(() => {
    const node = textRef.current;
    if (!node) return;

    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    const currentFontSize = node.fontSize();
    const currentWidth = node.width();

    // Only update if scale changed significantly (> 3%)
    // This prevents tiny accidental resizes
    const SCALE_THRESHOLD = 0.03;
    const scaleChanged = Math.abs(scaleX - 1) > SCALE_THRESHOLD || Math.abs(scaleY - 1) > SCALE_THRESHOLD;

    if (scaleChanged) {
      // Calculate new dimensions - scale both fontSize AND width
      const newFontSize = Math.max(8, Math.round(currentFontSize * scaleY));
      const newWidth = Math.round(currentWidth * scaleX);

      // Reset scale and apply new dimensions
      node.scale({ x: 1, y: 1 });
      node.fontSize(newFontSize);
      node.width(newWidth);

      // Commit to React state
      onFontSizeChange?.(newFontSize);
      onTransformEnd?.(node.x(), node.y(), newWidth, 1, 1);
    } else {
      // Just reset scale without changing dimensions
      node.scale({ x: 1, y: 1 });
      onTransformEnd?.(node.x(), node.y(), currentWidth, 1, 1);
    }
  }, [onFontSizeChange, onTransformEnd]);

  const handleDblClick = useCallback(() => {
    if (!editable) return;

    const textNode = textRef.current;
    if (!textNode) return;

    const stage = textNode.getStage();
    if (!stage) return;

    setIsEditing(true);

    const stageBox = stage.container().getBoundingClientRect();
    const textPosition = textNode.getAbsolutePosition();
    const scale = stage.scaleX();

    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);

    // Calculate position accounting for window scroll (getBoundingClientRect is viewport-relative)
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;

    textarea.value = text;
    textarea.style.position = 'absolute';
    textarea.style.top = `${stageBox.top + scrollY + textPosition.y}px`;
    textarea.style.left = `${stageBox.left + scrollX + textPosition.x}px`;
    textarea.style.width = `${(width ?? textNode.width()) * scale}px`;
    textarea.style.minHeight = `${textNode.height() * scale}px`;
    textarea.style.fontSize = `${fontSize * scale}px`;
    textarea.style.fontFamily = fontFamily;
    textarea.style.fontStyle = fontStyle.includes('italic') ? 'italic' : 'normal';
    textarea.style.fontWeight = fontStyle.includes('bold') ? 'bold' : 'normal';
    textarea.style.color = fill;
    textarea.style.textAlign = align;
    textarea.style.lineHeight = String(lineHeight);
    textarea.style.border = 'none';
    textarea.style.padding = '0px';
    textarea.style.margin = '0';
    textarea.style.background = 'none';
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
      const newText = textarea.value;
      if (newText !== text) {
        onTextChange?.(newText);
      }
      setIsEditing(false);
      document.body.removeChild(textarea);
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
    editable,
    text,
    width,
    fontSize,
    fontFamily,
    fontStyle,
    fill,
    align,
    lineHeight,
    padding,
    onTextChange,
  ]);

  const enabledAnchors = transformConfig?.enabledAnchors ?? DEFAULT_TEXT_ANCHORS;

  return (
    <>
      <KonvaText
        ref={textRef}
        id={id}
        text={text}
        x={x}
        y={y}
        width={width}
        fontSize={fontSize}
        fontFamily={fontFamily}
        fontStyle={fontStyle}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        align={align}
        verticalAlign={verticalAlign}
        lineHeight={lineHeight}
        wrap={wrap}
        padding={padding}
        draggable={draggable && !isEditing}
        visible={!isEditing}
        onClick={onSelect}
        onTap={onSelect}
        onDblClick={handleDblClick}
        onDblTap={handleDblClick}
        onDragEnd={handleDragEnd}
        onDragMove={handleDragMove}
        onTransform={handleTransform}
        onTransformEnd={handleTransformEnd}
      />
      {selected && !isEditing && (
        <Transformer
          ref={trRef}
          rotateEnabled={transformConfig?.rotateEnabled ?? false}
          flipEnabled={transformConfig?.flipEnabled ?? false}
          keepRatio={transformConfig?.keepRatio ?? true}
          enabledAnchors={enabledAnchors}
          boundBoxFunc={(oldBox, newBox) => {
            const minWidth = transformConfig?.bounds?.minWidth ?? 50;
            const maxWidth = transformConfig?.bounds?.maxWidth ?? Infinity;
            if (newBox.width < minWidth) return oldBox;
            if (newBox.width > maxWidth) return oldBox;
            return newBox;
          }}
        />
      )}
    </>
  );
}

// Memoize to prevent re-renders when parent (ZitatPureCanvas) updates due to snap state changes
export const CanvasText = memo(CanvasTextInner, (prevProps, nextProps) => {
  // Custom comparison: only re-render if these specific props changed
  // Ignore snapTargets array reference changes (we use the values inside)
  const keysToCompare: (keyof CanvasTextProps)[] = [
    'id', 'text', 'x', 'y', 'width', 'fontSize', 'fontFamily', 'fontStyle',
    'fill', 'stroke', 'strokeWidth', 'align', 'verticalAlign', 'lineHeight',
    'wrap', 'padding', 'draggable', 'selected', 'editable',
    'stageWidth', 'stageHeight', 'snapToCenter'
  ];

  for (const key of keysToCompare) {
    if (prevProps[key] !== nextProps[key]) {
      return false; // props changed, re-render
    }
  }

  // For callbacks and objects, assume they're stable (using useCallback in parent)
  return true; // props are equal, skip re-render
});
