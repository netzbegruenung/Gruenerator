// SPDX-License-Identifier: MPL-2.0
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

import { type CircleBadgeTextLine } from '@ggraphic/core';
import { useRef, useCallback, useEffect, useState, memo } from 'react';
import { Group, Circle, Text, Rect, Transformer } from 'react-konva';

import { LOCKED_TRANSFORMER, useIsItemLocked } from '@ggraphic/editor/components/canvasItemLock';
import { useSnapScheduler } from '@ggraphic/editor/hooks/useSnapScheduler';
import { messages } from '@ggraphic/editor/i18n/messages';
import { captureFocusOrigin, returnFocus } from '@ggraphic/editor/utils/editorFocus';
import { followStage } from '@ggraphic/editor/utils/followStage';
import { isGroupDrag } from '@ggraphic/editor/utils/multiSelect';
import { ELEMENT_TRANSFORMER, normalizeRotation } from '@ggraphic/editor/utils/orientation';
import { boxFrame, createBoxFrame, snapByBounds } from '@ggraphic/editor/utils/snapping';
import { stageCssScale } from '@ggraphic/editor/utils/stageCssScale';

import { useTextEditorOpener } from '../utils/textEditorOpeners.js';

import type { SnapTarget } from '@ggraphic/editor/utils/snapping';
import type Konva from 'konva';

export { type CircleBadgeInstance, type CircleBadgeTextLine } from '@ggraphic/core';

// Rahmen für Snap und Geometrie-Meldung, pro Aufruf neu beschrieben (synchron, ohne Allokation).
const dragFrame = createBoxFrame();

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
  getSnapTargets: (excludeId: string) => SnapTarget[];
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
  const locked = useIsItemLocked();
  const groupRef = useRef<Konva.Group>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const stopFollowingRef = useRef<(() => void) | null>(null);
  const textNodesRef = useRef<(Konva.Text | null)[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const snap = useSnapScheduler({ onSnapChange, onSnapLinesChange });

  useEffect(() => {
    if (selected && editingIndex === null && groupRef.current && transformerRef.current) {
      transformerRef.current.nodes([groupRef.current]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [selected, editingIndex]);

  // Cleanup input on unmount
  useEffect(() => {
    return () => {
      stopFollowingRef.current?.();
      stopFollowingRef.current = null;
      if (inputRef.current && document.body.contains(inputRef.current)) {
        document.body.removeChild(inputRef.current);
      }
    };
  }, []);

  const handleDragMove = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      const node = e.currentTarget as Konva.Group;
      if (isGroupDrag(node)) return;
      const scaleX = node.scaleX();
      const scaleY = node.scaleY();

      const contentWidth = radius * 2 * scaleX;
      const contentHeight = radius * 2 * scaleY;

      const result = snapByBounds(
        boxFrame(
          dragFrame,
          node.x(),
          node.y(),
          contentWidth,
          contentHeight,
          node.rotation(),
          'centre'
        ),
        getSnapTargets(id),
        stageWidth,
        stageHeight,
        snap.hysteresis
      );

      node.position({ x: result.x, y: result.y });
      snap.scheduleSnap(result.snapH, result.snapV, result.snapLines);
    },
    [id, radius, getSnapTargets, stageWidth, stageHeight, snap]
  );

  const handleDragEnd = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      snap.onDragEnd();
      onDragEnd(e.target.x(), e.target.y());
    },
    [onDragEnd, snap]
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
    (index: number) => {
      if (!onTextLineChange) return;

      const textNode = textNodesRef.current[index];
      const stage = textNode?.getStage();
      if (!textNode || !stage) return;

      // Woher die Bearbeitung kam (Ebenen-Eintrag oder Seite) — dorthin geht der Fokus danach.
      const origin = captureFocusOrigin(stage.container());
      setEditingIndex(index);

      let input = inputRef.current;
      if (!input) {
        input = document.createElement('input');
        document.body.appendChild(input);
        inputRef.current = input;
      }

      const line = textLines[index];
      const lineHeight = 1.2;
      const textH = line.fontSize * lineHeight;

      input.value = line.text;
      input.setAttribute('aria-label', messages().common.editText);
      input.style.position = 'absolute';
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

      // Lage und Mass aus der Bühne, wie sie jetzt liegt — beim Öffnen und bei jeder Verschiebung.
      const place = () => {
        const stageBox = stage.container().getBoundingClientRect();
        const cssScale = stageCssScale(stage, stageBox);
        const textPosition = textNode.getAbsolutePosition();
        const absScale = textNode.getAbsoluteScale();
        const scaleX = absScale.x * cssScale;
        const scaleY = absScale.y * cssScale;
        const scrollX = window.scrollX || window.pageXOffset;
        const scrollY = window.scrollY || window.pageYOffset;

        input.style.top = `${stageBox.top + scrollY + textPosition.y * cssScale}px`;
        input.style.left = `${stageBox.left + scrollX + textPosition.x * cssScale}px`;
        input.style.width = `${radius * 2 * scaleX}px`;
        input.style.height = `${textH * scaleY}px`;
        input.style.fontSize = `${line.fontSize * scaleY}px`;
        // Der Textknoten trägt die Drehung der Gruppe; seine linke obere Ecke ist sein Ursprung.
        input.style.transform = `rotate(${normalizeRotation(textNode.getAbsoluteRotation())}deg)`;
      };
      place();
      stopFollowingRef.current?.();
      stopFollowingRef.current = followStage(stage, place);

      input.focus();
      input.select();

      const removeInput = () => {
        stopFollowingRef.current?.();
        stopFollowingRef.current = null;
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
        returnFocus(origin);
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
        // Das Feld hängt am Ende von <body>: Tab führte von dort ins Nirgendwo.
        if (ev.key === 'Tab') {
          ev.preventDefault();
          input?.blur();
        }
      });
    },
    [onTextLineChange, textLines, textColor, radius]
  );

  // „Text bearbeiten“ (F2, Enter in der Ebenen-Liste, Kontextmenü) beginnt mit der ersten Zeile.
  useTextEditorOpener(id, () => handleDblClick(0));

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
        draggable={editingIndex === null && !locked}
        onDragStart={snap.onDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        onTransformEnd={handleTransformEnd}
        onMouseDown={onSelect}
        onTouchStart={onSelect}
      >
        {/* Circle background */}
        <Circle x={0} y={0} radius={radius} fill={backgroundColor} />

        {/* Text lines centered in circle */}
        {textLines.map((line, index) => {
          const isEditingThis = editingIndex === index;
          return (
            <Text
              // eslint-disable-next-line react/no-array-index-key -- text lines are fixed slots edited by index; order is the identity
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
              ref={(node) => {
                textNodesRef.current[index] = node;
              }}
              onDblClick={() => handleDblClick(index)}
              onDblTap={() => handleDblClick(index)}
            />
          );
        })}

        {/* Selection indicator */}
        {selected && (
          <Rect
            name="selection-chrome"
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
          rotateEnabled={true}
          {...ELEMENT_TRANSFORMER}
          {...(locked ? LOCKED_TRANSFORMER : {})}
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
