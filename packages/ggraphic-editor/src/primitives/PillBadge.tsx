// SPDX-License-Identifier: MPL-2.0
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

import { LOCKED_TRANSFORMER, useIsItemLocked } from '@ggraphic/editor/components/canvasItemLock';
import { useSnapScheduler } from '@ggraphic/editor/hooks/useSnapScheduler';
import { captureFocusOrigin, returnFocus } from '@ggraphic/editor/utils/editorFocus';
import { followStage } from '@ggraphic/editor/utils/followStage';
import { isGroupDrag } from '@ggraphic/editor/utils/multiSelect';
import { ELEMENT_TRANSFORMER, normalizeRotation } from '@ggraphic/editor/utils/orientation';
import { boxFrame, createBoxFrame, snapByBounds } from '@ggraphic/editor/utils/snapping';
import { stageCssScale } from '@ggraphic/editor/utils/stageCssScale';

import { calculatePillBadgeDimensions } from '../utils/pillBadgeUtils';
import { useTextEditorOpener } from '../utils/textEditorOpeners';

import type { PillBadgeFontStyle } from '../utils/pillBadgeUtils';
import type { SnapTarget, SnapLine } from '@ggraphic/editor/utils/snapping';
import type Konva from 'konva';

// Rahmen für Snap und Geometrie-Meldung, pro Aufruf neu beschrieben (synchron, ohne Allokation).
const dragFrame = createBoxFrame();

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
  const locked = useIsItemLocked();
  const groupRef = useRef<Konva.Group>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const [isEditing, setIsEditing] = useState(false);
  const stopFollowingRef = useRef<(() => void) | null>(null);

  const stopFollowing = useCallback(() => {
    stopFollowingRef.current?.();
    stopFollowingRef.current = null;
  }, []);
  useEffect(() => stopFollowing, [stopFollowing]);

  const snap = useSnapScheduler({ onSnapChange, onSnapLinesChange });

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
      const node = e.currentTarget as Konva.Group;
      if (isGroupDrag(node)) return;
      const scaleX = node.scaleX();
      const scaleY = node.scaleY();

      const contentWidth = dimensions.width * scaleX;
      const contentHeight = dimensions.height * scaleY;

      const result = snapByBounds(
        boxFrame(
          dragFrame,
          node.x(),
          node.y(),
          contentWidth,
          contentHeight,
          node.rotation(),
          'top-left'
        ),
        getSnapTargets(id),
        stageWidth,
        stageHeight,
        snap.hysteresis
      );

      node.position({ x: result.x, y: result.y });
      snap.scheduleSnap(result.snapH, result.snapV, result.snapLines);
    },
    [id, dimensions, getSnapTargets, stageWidth, stageHeight, snap]
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

  const handleDblClick = useCallback(() => {
    const group = groupRef.current;
    if (!group) return;

    const stage = group.getStage();
    if (!stage) return;

    // Woher die Bearbeitung kam (Ebenen-Eintrag oder Seite) — dorthin geht der Fokus danach.
    const origin = captureFocusOrigin(stage.container());
    setIsEditing(true);

    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);

    textarea.value = text;
    textarea.setAttribute('aria-label', 'Text bearbeiten');
    textarea.style.position = 'absolute';
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

    // Lage und Mass aus der Bühne, wie sie jetzt liegt — beim Öffnen und bei jeder Verschiebung.
    const place = () => {
      const stageBox = stage.container().getBoundingClientRect();
      const absolutePos = group.getAbsolutePosition();
      const cssScale = stageCssScale(stage, stageBox);
      // Der Maßstab des Knotens trägt `scale`, die Format-Gruppe aus `CanvasStage`
      // und die Bühne; `stage.scaleX()` allein kannte die Format-Gruppe nicht.
      const nodeScale = group.getAbsoluteScale().x * cssScale;
      const scrollX = window.scrollX || window.pageXOffset;
      const scrollY = window.scrollY || window.pageYOffset;

      const scaledFontSize = fontSize * nodeScale;
      const scaledPaddingX = paddingX * nodeScale;
      const scaledPaddingY = paddingY * nodeScale;
      const scaledWidth = dimensions.width * nodeScale;

      textarea.style.top = `${stageBox.top + scrollY + absolutePos.y * cssScale + scaledPaddingY}px`;
      textarea.style.left = `${stageBox.left + scrollX + absolutePos.x * cssScale + scaledPaddingX}px`;
      textarea.style.width = `${scaledWidth - scaledPaddingX * 2}px`;
      textarea.style.height = `${scaledFontSize * 1.2}px`;
      textarea.style.fontSize = `${scaledFontSize}px`;
      // Gedreht um den Ursprung der Pille, nicht um die Textecke: der Text sitzt um das Polster versetzt.
      textarea.style.transformOrigin = `${-scaledPaddingX}px ${-scaledPaddingY}px`;
      textarea.style.transform = `rotate(${normalizeRotation(group.getAbsoluteRotation())}deg)`;
    };
    place();
    // Ein noch offener Editor dieser Pille folgt nicht weiter; jeder Editor
    // beendet beim Schliessen nur seinen eigenen Mitläufer.
    stopFollowing();
    const stopThisFollower = followStage(stage, place);
    stopFollowingRef.current = stopThisFollower;

    textarea.focus();
    textarea.select();

    const removeTextarea = () => {
      stopThisFollower();
      if (stopFollowingRef.current === stopThisFollower) stopFollowingRef.current = null;
      const newText = textarea.value.trim();
      if (newText && newText !== text) {
        onTextChange(newText);
      }
      setIsEditing(false);
      if (textarea.parentNode) {
        document.body.removeChild(textarea);
      }
      returnFocus(origin);
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
      // Das Feld hängt am Ende von <body>: Tab führte von dort ins Nirgendwo.
      if (e.key === 'Tab') {
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
    dimensions,
    onTextChange,
    stopFollowing,
  ]);

  // „Text bearbeiten“ (F2, Enter in der Ebenen-Liste, Kontextmenü) — derselbe Weg wie ein Doppelklick.
  useTextEditorOpener(id, handleDblClick);

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
        draggable={!isEditing && !locked}
        onDragStart={snap.onDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        onTransformEnd={handleTransformEnd}
        onMouseDown={onSelect}
        onTouchStart={onSelect}
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
            name="selection-chrome"
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
          rotateEnabled={true}
          {...ELEMENT_TRANSFORMER}
          {...(locked ? LOCKED_TRANSFORMER : {})}
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
