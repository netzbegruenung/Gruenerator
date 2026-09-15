/**
 * CanvasListText — ein Textblock, dessen Zeilen mit einem Aufzählungszeichen
 * beginnen.
 *
 * Warum ein eigener Renderer: Konva.Text kennt keinen hängenden Einzug. Eine
 * umbrechende Aufzählung wurde deshalb auf Spalte 0 zurückgesetzt und las sich
 * wie ein neuer Punkt. Hier steht je Zeile ein eigener Knoten — der Marker am
 * Blockrand, der Text um `indent` nach rechts —, und ALLE Zeilen eines Punktes
 * tragen denselben Einzug.
 *
 * Die Zeilen sind vorberechnet (`layoutTextBlock`) und werden mit `wrap="none"`
 * gesetzt: derselbe Umbruch, den der Server-Renderer fährt, statt zweier
 * Verfahren, die auseinanderdriften.
 *
 * Die Aufteilung zwischen diesem Renderer und dem gewöhnlichen `CanvasText`
 * entscheidet `CanvasText` selbst — an der Komponentengrenze, nicht in einem
 * Zweig innerhalb einer Komponente, damit die Hook-Reihenfolge stabil bleibt,
 * wenn ein Text seinen ersten Marker bekommt.
 */

import { layoutTextBlock } from '@gruenerator/contracts';
import { useRef, useEffect, useState, useCallback, useMemo, Fragment } from 'react';
import { Group, Text as KonvaText, Transformer } from 'react-konva';

import { useGeometryReporter } from '../hooks/useGeometryReporter';
import { useSnapScheduler } from '../hooks/useSnapScheduler';
import { calculateElementSnapPosition } from '../utils/snapping';
import { textMeasurer } from '../utils/textUtils';

import { type CanvasTextProps } from './CanvasText';

import type Konva from 'konva';
import type { TransformAnchor } from '@gruenerator/shared/canvas-editor';

const DEFAULT_TEXT_ANCHORS: TransformAnchor[] = ['middle-left', 'middle-right'];

export function CanvasListText({
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
  opacity = 1,
  stroke,
  strokeWidth,
  shadowColor,
  shadowBlur,
  shadowOffsetX,
  shadowOffsetY,
  shadowOpacity,
  align = 'left',
  lineHeight = 1.2,
  padding = 0,
  draggable = true,
  selected = false,
  editable = false,
  transformConfig,
  onSelect,
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
  const groupRef = useRef<Konva.Group>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const [isEditing, setIsEditing] = useState(false);

  const measure = useMemo(
    () => textMeasurer(fontSize, fontFamily, fontStyle),
    [fontSize, fontFamily, fontStyle]
  );

  // Ohne gesetzte Breite gibt es nichts zu umbrechen; der Einzug gilt trotzdem,
  // damit die Marker eine Spalte bilden.
  const innerWidth = width != null ? Math.max(width - 2 * padding, 1) : Number.POSITIVE_INFINITY;
  const lines = useMemo(
    () => layoutTextBlock(text, innerWidth, measure),
    [text, innerWidth, measure]
  );

  const lineHeightPx = fontSize * lineHeight;
  const blockHeight = lines.length * lineHeightPx + 2 * padding;
  // Ohne feste Breite die breiteste gesetzte Zeile — der Transformer und die
  // Snap-Ziele brauchen eine Box, eine Gruppe misst sich nicht selbst.
  const blockWidth =
    width ?? Math.max(...lines.map((line) => line.indent + measure(line.text)), 1) + 2 * padding;

  useEffect(() => {
    if (selected && trRef.current && groupRef.current && !isEditing) {
      trRef.current.nodes([groupRef.current]);
      trRef.current.getLayer()?.batchDraw();
    } else if (!selected && trRef.current) {
      trRef.current.nodes([]);
    }
  }, [selected, isEditing]);

  const reportGeometry = useGeometryReporter(id, onGeometryChange);
  useEffect(() => {
    const node = groupRef.current;
    if (!node) return;
    reportGeometry(node.x(), node.y(), blockWidth * node.scaleX(), blockHeight * node.scaleY());
  }, [reportGeometry, x, y, blockWidth, blockHeight]);

  const snap = useSnapScheduler({
    onSnapChange: onSnapChange ?? (() => {}),
    onSnapLinesChange: onSnapLinesChange ?? (() => {}),
  });

  const handleDragMove = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      const node = e.target;
      if (!stageWidth || !stageHeight) return;
      if ((snapTargets && snapTargets.length > 0) || snapToCenter) {
        const result = calculateElementSnapPosition(
          node.x(),
          node.y(),
          blockWidth * node.scaleX(),
          blockHeight * node.scaleY(),
          snapTargets || [],
          stageWidth,
          stageHeight,
          snap.hysteresis
        );
        node.position({ x: result.x, y: result.y });
        snap.scheduleSnap(result.snapH, result.snapV, result.snapLines);
      }
    },
    [snapToCenter, stageWidth, stageHeight, snapTargets, snap, blockWidth, blockHeight]
  );

  const handleDragEnd = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      const node = e.target;
      snap.onDragEnd();
      onDragEnd?.(node.x(), node.y());
      if (id && onPositionChange) {
        onPositionChange(id, node.x(), node.y(), blockWidth, blockHeight);
      }
    },
    [id, onDragEnd, onPositionChange, snap, blockWidth, blockHeight]
  );

  const handleTransformEnd = useCallback(() => {
    const node = groupRef.current;
    if (!node) return;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    const SCALE_THRESHOLD = 0.03;
    const scaleChanged =
      Math.abs(scaleX - 1) > SCALE_THRESHOLD || Math.abs(scaleY - 1) > SCALE_THRESHOLD;

    node.scale({ x: 1, y: 1 });

    if (scaleChanged) {
      // Eine Gruppe trägt keine fontSize — anders als beim einfachen Textknoten
      // wird sie aus der Prop und dem Maßstab gerechnet.
      const newFontSize = Math.max(8, Math.round(fontSize * scaleY));
      const newWidth = Math.round(blockWidth * scaleX);
      onFontSizeChange?.(newFontSize);
      onTransformEnd?.(node.x(), node.y(), newWidth, 1, 1);
    } else {
      onTransformEnd?.(node.x(), node.y(), blockWidth, 1, 1);
    }
  }, [fontSize, blockWidth, onFontSizeChange, onTransformEnd]);

  const handleDblClick = useCallback(() => {
    if (!editable) return;
    const node = groupRef.current;
    const stage = node?.getStage();
    if (!node || !stage) return;

    setIsEditing(true);

    const stageBox = stage.container().getBoundingClientRect();
    const position = node.getAbsolutePosition();
    const scale = stage.scaleX();
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);

    textarea.value = text;
    textarea.style.position = 'absolute';
    textarea.style.top = `${stageBox.top + window.scrollY + position.y}px`;
    textarea.style.left = `${stageBox.left + window.scrollX + position.x}px`;
    textarea.style.width = `${blockWidth * scale}px`;
    textarea.style.minHeight = `${blockHeight * scale}px`;
    textarea.style.fontSize = `${fontSize * scale}px`;
    textarea.style.fontFamily = fontFamily;
    textarea.style.color = fill;
    textarea.style.textAlign = align;
    textarea.style.lineHeight = String(lineHeight);
    textarea.style.border = 'none';
    textarea.style.padding = '0px';
    textarea.style.margin = '0';
    textarea.style.background = 'none';
    textarea.style.outline = '2px solid #0088cc';
    textarea.style.outlineOffset = '2px';
    textarea.style.resize = 'none';
    textarea.style.overflow = 'hidden';
    textarea.style.zIndex = '10000';
    textarea.style.transformOrigin = 'left top';
    textarea.focus();
    textarea.select();

    const removeTextarea = () => {
      if (textarea.value !== text) onTextChange?.(textarea.value);
      setIsEditing(false);
      textarea.remove();
    };
    textarea.addEventListener('blur', removeTextarea);
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        textarea.value = text;
        textarea.blur();
      }
      // Enter setzt eine neue Zeile — in einer Aufzählung ist das der
      // Normalfall. Abschluss über Klick daneben, Escape oder Cmd/Strg+Enter.
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        textarea.blur();
      }
    });
  }, [
    editable,
    text,
    blockWidth,
    blockHeight,
    fontSize,
    fontFamily,
    fill,
    align,
    lineHeight,
    onTextChange,
  ]);

  const enabledAnchors = transformConfig?.enabledAnchors ?? DEFAULT_TEXT_ANCHORS;

  return (
    <>
      <Group
        ref={groupRef}
        id={id}
        x={x}
        y={y}
        width={blockWidth}
        height={blockHeight}
        rotation={rotation}
        opacity={opacity}
        draggable={draggable && !isEditing}
        visible={!isEditing}
        onClick={onSelect}
        onTap={onSelect}
        onDblClick={handleDblClick}
        onDblTap={handleDblClick}
        onDragStart={snap.onDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        onTransformEnd={handleTransformEnd}
      >
        {lines.map((line, index) => {
          // Konva zeichnet eine Zeile mittig in ihre Zeilenbox (textBaseline
          // "middle"). Ein Stapel einzeiliger Knoten im Abstand einer Zeilenbox
          // liegt deshalb exakt dort, wo ein mehrzeiliger Textknoten läge.
          const top = padding + index * lineHeightPx;
          return (
            <Fragment key={index}>
              {line.marker !== null && (
                <KonvaText
                  text={line.marker}
                  x={padding}
                  y={top}
                  fontSize={fontSize}
                  fontFamily={fontFamily}
                  fontStyle={fontStyle}
                  fill={fill}
                  lineHeight={lineHeight}
                  wrap="none"
                  listening={false}
                />
              )}
              <KonvaText
                text={line.text}
                x={padding + line.indent}
                y={top}
                {...(width != null
                  ? { width: Math.max(width - 2 * padding - line.indent, 1) }
                  : {})}
                fontSize={fontSize}
                fontFamily={fontFamily}
                fontStyle={fontStyle}
                fill={fill}
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
                lineHeight={lineHeight}
                wrap="none"
                listening={false}
              />
            </Fragment>
          );
        })}
      </Group>
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
