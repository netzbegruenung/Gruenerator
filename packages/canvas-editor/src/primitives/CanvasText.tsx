/**
 * CanvasText - Draggable, transformable, editable text layer
 *
 * Konva Best Practice for Font Size Changes:
 * - During transform: Only update Konva node visually (no React state)
 * - On transformEnd: Commit to state via callback
 * - This prevents re-renders during drag for smooth UX
 */

import { hasInlineMarks, hasListMarkers } from '@gruenerator/contracts';
import { useRef, useEffect, useState, useCallback, memo } from 'react';
import { Text as KonvaText, Transformer } from 'react-konva';

import { overlayBoxForNode, useCanvasTextEditor } from '../components/CanvasTextOverlay';

import { CanvasRichText } from './CanvasRichText';

import { calculateSnapPosition, calculateElementSnapPosition } from '../utils/snapping';
import { gradientToKonvaProps, type GradientFill } from '../utils/gradientFill';

import { useGeometryReporter, type GeometryReporter } from '../hooks/useGeometryReporter';
import { useSnapScheduler } from '../hooks/useSnapScheduler';

import type { SnapTarget, SnapLine } from '../utils/snapping';
import type { TransformConfig, TransformAnchor } from '@gruenerator/shared/canvas-editor';
import type Konva from 'konva';

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
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  stroke?: string;
  strokeWidth?: number;
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  shadowOpacity?: number;
  fillGradient?: GradientFill | null;
  align?: 'left' | 'center' | 'right';
  verticalAlign?: 'top' | 'middle' | 'bottom';
  lineHeight?: number;
  wrap?: 'word' | 'char' | 'none';
  padding?: number;
  draggable?: boolean;
  selected?: boolean;
  editable?: boolean;
  /**
   * Der Text trägt Markdown-lite und wird mit dem Rich-Text-Editor
   * bearbeitet — siehe `TextElementConfig.richText`.
   */
  richText?: boolean;
  opacity?: number;
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
  /** Meldet die gerenderte Geometrie als Snap-Ziel — unabhaengig davon, ob je gezogen wurde. */
  onGeometryChange?: GeometryReporter;
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
  rotation,
  scaleX,
  scaleY,
  stroke,
  strokeWidth,
  shadowColor,
  shadowBlur,
  shadowOffsetX,
  shadowOffsetY,
  shadowOpacity,
  fillGradient,
  align = 'left',
  verticalAlign = 'top',
  lineHeight = 1.2,
  wrap = 'word',
  padding = 0,
  draggable = true,
  selected = false,
  editable = false,
  opacity = 1,
  transformConfig,
  onSelect,
  onDeselect,
  onTextChange,
  onDragEnd,
  onTransformEnd,
  onFontSizeChange,
  snapToCenter = true,
  stageWidth,
  stageHeight,
  onSnapChange,
  snapTargets,
  onPositionChange,
  onGeometryChange,
  onSnapLinesChange,
}: CanvasTextProps) {
  const textRef = useRef<Konva.Text>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const { open, isEditing } = useCanvasTextEditor(id);
  // Konva paints gradients in the node's local box; measure the rendered text
  // box (auto-width/height depend on wrapping) so non-vertical gradient angles
  // don't collapse to a single stop.
  const [measuredRect, setMeasuredRect] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    if (fillGradient && textRef.current) {
      const rect = textRef.current.getSelfRect();
      setMeasuredRect({ width: rect.width, height: rect.height });
    }
  }, [fillGradient, text, fontSize, fontFamily, fontStyle, width, lineHeight]);

  const gradientProps =
    fillGradient && measuredRect && measuredRect.height > 0
      ? gradientToKonvaProps(fillGradient, {
          x: 0,
          y: 0,
          width: measuredRect.width,
          height: measuredRect.height,
        })
      : null;
  const snap = useSnapScheduler({
    onSnapChange: onSnapChange ?? (() => {}),
    onSnapLinesChange: onSnapLinesChange ?? (() => {}),
  });

  useEffect(() => {
    if (selected && trRef.current && textRef.current && !isEditing) {
      trRef.current.nodes([textRef.current]);
      trRef.current.getLayer()?.batchDraw();
    } else if (!selected && trRef.current) {
      trRef.current.nodes([]);
    }
  }, [selected, isEditing]);

  const reportGeometry = useGeometryReporter(id, onGeometryChange);

  // Nach jedem Layout-Durchgang die tatsaechlich gerenderte Box melden. Bei Text
  // ist die Hoehe erst nach dem Umbruch bekannt, deshalb vom Knoten gelesen und
  // nicht aus den Props gerechnet.
  useEffect(() => {
    const node = textRef.current;
    if (!node) return;
    reportGeometry(node.x(), node.y(), node.width() * node.scaleX(), node.height() * node.scaleY());
  }, [
    reportGeometry,
    text,
    x,
    y,
    width,
    fontSize,
    fontFamily,
    fontStyle,
    lineHeight,
    padding,
    scaleX,
    scaleY,
  ]);

  const handleDragEnd = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      const node = e.target as Konva.Text;
      const nodeWidth = node.width() * node.scaleX();
      const nodeHeight = node.height() * node.scaleY();

      snap.onDragEnd();
      onDragEnd?.(node.x(), node.y());

      if (id && onPositionChange) {
        onPositionChange(id, node.x(), node.y(), nodeWidth, nodeHeight);
      }
    },
    [id, onDragEnd, onPositionChange, snap]
  );

  const handleDragMove = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      const node = e.target as Konva.Text;
      const nodeWidth = node.width() * node.scaleX();
      const nodeHeight = node.height() * node.scaleY();

      if (!stageWidth || !stageHeight) return;

      if ((snapTargets && snapTargets.length > 0) || snapToCenter) {
        const result = calculateElementSnapPosition(
          node.x(),
          node.y(),
          nodeWidth,
          nodeHeight,
          snapTargets || [],
          stageWidth,
          stageHeight,
          snap.hysteresis
        );

        node.position({ x: result.x, y: result.y });
        snap.scheduleSnap(result.snapH, result.snapV, result.snapLines);
      }
    },
    [snapToCenter, stageWidth, stageHeight, snapTargets, snap]
  );

  // Let Konva handle visual scaling; fontSize is committed on transformEnd
  const handleTransform = useCallback(() => {}, []);

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
    const scaleChanged =
      Math.abs(scaleX - 1) > SCALE_THRESHOLD || Math.abs(scaleY - 1) > SCALE_THRESHOLD;

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
    const node = textRef.current;
    const box = node && overlayBoxForNode(node, width ?? node.width(), node.height());
    if (!editable || !box) return;
    open({
      id: id ?? '',
      box,
      text,
      fontFamily,
      fontSize,
      fontStyle,
      fill,
      align,
      lineHeight,
      onTextChange,
    });
  }, [
    editable,
    open,
    id,
    text,
    width,
    fontFamily,
    fontSize,
    fontStyle,
    fill,
    align,
    lineHeight,
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
        {...(gradientProps
          ? { ...gradientProps, fillPriority: 'linear-gradient' as const }
          : { fillPriority: 'color' as const })}
        rotation={rotation}
        scaleX={scaleX}
        scaleY={scaleY}
        opacity={opacity}
        stroke={stroke}
        strokeWidth={strokeWidth}
        fillAfterStrokeEnabled={!!stroke && (strokeWidth ?? 0) > 0}
        lineJoin="round"
        shadowColor={shadowColor}
        shadowBlur={shadowBlur}
        shadowOffsetX={shadowOffsetX}
        shadowOffsetY={shadowOffsetY}
        shadowOpacity={shadowOpacity}
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
        onDragStart={snap.onDragStart}
        onDragEnd={handleDragEnd}
        onDragMove={handleDragMove}
        onTransform={handleTransform}
        onTransformEnd={handleTransformEnd}
      />
      {selected && !isEditing && (
        <Transformer
          ref={trRef}
          rotateEnabled={transformConfig?.rotateEnabled ?? false}
          rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
          rotationSnapTolerance={7}
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

/**
 * Aufzählungen brauchen einen hängenden Einzug und Auszeichnung gemischte
 * Schnitte — beides kennt ein einzelner Konva.Text nicht, das zeichnet
 * {@link CanvasRichText} als Gruppe aus Marker-, Lauf- und Textknoten. Ein
 * `richText`-Feld nimmt immer diesen Weg, damit sein Editor auch ohne ersten
 * Marker der Rich-Text-Editor ist; alles andere bleibt exakt der bisherige
 * eine Textknoten.
 */
function CanvasTextSwitch(props: CanvasTextProps) {
  return props.richText || hasListMarkers(props.text) || hasInlineMarks(props.text) ? (
    <CanvasRichText {...props} />
  ) : (
    <CanvasTextInner {...props} />
  );
}

// Memoize to prevent re-renders when parent (ZitatPureCanvas) updates due to snap state changes
export const CanvasText = memo(CanvasTextSwitch, (prevProps, nextProps) => {
  // Custom comparison: only re-render if these specific props changed
  // Ignore snapTargets array reference changes (we use the values inside)
  const keysToCompare: (keyof CanvasTextProps)[] = [
    'id',
    'text',
    'x',
    'y',
    'width',
    'fontSize',
    'fontFamily',
    'fontStyle',
    'fill',
    'stroke',
    'strokeWidth',
    'shadowColor',
    'shadowBlur',
    'shadowOffsetX',
    'shadowOffsetY',
    'shadowOpacity',
    'fillGradient',
    'align',
    'verticalAlign',
    'lineHeight',
    'wrap',
    'padding',
    'draggable',
    'selected',
    'editable',
    'richText',
    'opacity',
    'stageWidth',
    'stageHeight',
    'snapToCenter',
  ];

  for (const key of keysToCompare) {
    if (prevProps[key] !== nextProps[key]) {
      return false; // props changed, re-render
    }
  }

  // For callbacks and objects, assume they're stable (using useCallback in parent)
  return true; // props are equal, skip re-render
});
