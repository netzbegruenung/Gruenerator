/**
 * CanvasRichText — ein Textblock mit Aufzählung und/oder Inline-Auszeichnung.
 *
 * Warum ein eigener Renderer: Konva.Text kennt weder einen hängenden Einzug
 * noch gemischte Schnitte in einem Knoten. Hier steht je Zeile ein Marker-
 * Knoten am Blockrand und je Lauf ein eigener Textknoten an seiner gemessenen
 * Position — fett, kursiv oder unterstrichen, wie der Lauf es trägt —, und
 * ALLE Zeilen eines Punktes tragen denselben Einzug.
 *
 * Die Zeilen sind vorberechnet (`layoutRichTextBlock`) und werden mit
 * `wrap="none"` gesetzt: derselbe Umbruch, den der Server-Renderer fährt,
 * statt zweier Verfahren, die auseinanderdriften.
 *
 * Die Aufteilung zwischen diesem Renderer und dem gewöhnlichen `CanvasText`
 * entscheidet `CanvasText` selbst — an der Komponentengrenze, nicht in einem
 * Zweig innerhalb einer Komponente, damit die Hook-Reihenfolge stabil bleibt,
 * wenn ein Text seinen ersten Marker bekommt.
 *
 * Bearbeitet wird mit `RichTextField`, das der `CanvasTextEditorProvider`
 * NEBEN der Bühne im DOM aufspannt (siehe `CanvasTextOverlay`) — nicht aus dem
 * Konva-Baum heraus und nicht mit einer nackten Textarea: nur so sieht man beim
 * Tippen Fett statt Sternchen.
 */

import { layoutRichTextBlock } from '@gruenerator/contracts';
import { useRef, useEffect, useCallback, useMemo, Fragment } from 'react';
import { Group, Text as KonvaText, Transformer } from 'react-konva';

import { overlayBoxForNode, useCanvasTextEditor } from '../components/CanvasTextOverlay';
import { useFontGeneration } from '../hooks/useFontGeneration';
import { useGeometryReporter } from '../hooks/useGeometryReporter';
import { useSnapScheduler } from '../hooks/useSnapScheduler';
import { calculateElementSnapPosition } from '../utils/snapping';
import { fontStyleForRun, runMeasurer } from '../utils/textUtils';

import { type CanvasTextProps } from './CanvasText';

import type Konva from 'konva';
import type { TransformAnchor } from '@gruenerator/shared/canvas-editor';

const DEFAULT_TEXT_ANCHORS: TransformAnchor[] = ['middle-left', 'middle-right'];

export function CanvasRichText({
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
  const { open, isEditing } = useCanvasTextEditor(id);

  // Ein nachgeladener Schriftschnitt misst anders. Ohne diese Abhängigkeit
  // bliebe der mit der Ersatzschrift gerechnete Umbruch stehen — siehe
  // `useFontGeneration`.
  const fontGeneration = useFontGeneration();
  const measure = useMemo(
    () => runMeasurer(fontSize, fontFamily, fontStyle),
    [fontSize, fontFamily, fontStyle, fontGeneration]
  );

  // Ohne gesetzte Breite gibt es nichts zu umbrechen; der Einzug gilt trotzdem,
  // damit die Marker eine Spalte bilden.
  const innerWidth = width != null ? Math.max(width - 2 * padding, 1) : Number.POSITIVE_INFINITY;
  const lines = useMemo(
    () => layoutRichTextBlock(text, innerWidth, measure),
    [text, innerWidth, measure]
  );

  const lineHeightPx = fontSize * lineHeight;
  const blockHeight = lines.length * lineHeightPx + 2 * padding;
  // Breite je Zeile: der Marker steht links davor, der letzte Lauf endet rechts.
  const lineWidths = useMemo(
    () =>
      lines.map((line) => {
        const last = line.runs[line.runs.length - 1];
        return line.indent + (last ? last.x + measure(last.text, last) : 0);
      }),
    [lines, measure]
  );
  // Ohne feste Breite die breiteste gesetzte Zeile — der Transformer und die
  // Snap-Ziele brauchen eine Box, eine Gruppe misst sich nicht selbst.
  const blockWidth = width ?? Math.max(...lineWidths, 1) + 2 * padding;
  const innerBoxWidth = Math.max(blockWidth - 2 * padding, 1);

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
    const node = groupRef.current;
    const box = node && overlayBoxForNode(node, blockWidth, blockHeight);
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
      opacity,
      onTextChange,
    });
  }, [
    editable,
    open,
    id,
    text,
    blockWidth,
    blockHeight,
    fontFamily,
    fontSize,
    fontStyle,
    fill,
    align,
    lineHeight,
    opacity,
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
          // Die Läufe stehen an gemessenen x-Positionen, also richtet sich die
          // Zeile nicht von selbst aus — der Versatz muss hier rein. Ohne ihn
          // rutschten alle zentrierten Vorlagen (die AT-Sujets) nach links,
          // sobald ihr Text einen Marker trägt.
          const offset =
            align === 'center'
              ? (innerBoxWidth - lineWidths[index]!) / 2
              : align === 'right'
                ? innerBoxWidth - lineWidths[index]!
                : 0;
          return (
            <Fragment key={index}>
              {line.marker !== null && (
                <KonvaText
                  text={line.marker}
                  x={padding + offset}
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
              {line.runs.map((run, runIndex) => (
                <KonvaText
                  key={runIndex}
                  text={run.text}
                  x={padding + offset + line.indent + run.x}
                  y={top}
                  fontSize={fontSize}
                  fontFamily={fontFamily}
                  fontStyle={fontStyleForRun(fontStyle, run)}
                  textDecoration={run.underline ? 'underline' : ''}
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
                  lineHeight={lineHeight}
                  wrap="none"
                  listening={false}
                />
              ))}
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
