/**
 * BalkenGroup - Reusable Konva component for rendering decorative parallelogram bars
 *
 * Renders 1 or 3 skewed parallelogram bars with text inside, matching DreizeilenCanvas style exactly.
 * Uses the same layout calculations as calculateDreizeilenLayout.
 */

import { useRef, useCallback, useMemo, useEffect, useState, memo } from 'react';
import { Group, Line, Text, Rect, Transformer } from 'react-konva';

import { LOCKED_TRANSFORMER, useIsItemLocked } from '../components/canvasItemLock';
import { useFontGeneration } from '../hooks/useFontGeneration';
import { useSnapScheduler } from '../hooks/useSnapScheduler';
import { calculateBalkenLayouts } from '../utils/balkenBounds';
import {
  DREIZEILEN_CONFIG,
  getColorScheme,
  calculateParallelogramPoints,
  flattenPoints,
} from '../utils/dreizeilenLayout';
import { captureFocusOrigin, returnFocus, type FocusOrigin } from '../utils/editorFocus';
import { followStage } from '../utils/followStage';
import { isGroupDrag } from '../utils/multiSelect';
import { ELEMENT_TRANSFORMER, normalizeRotation } from '../utils/orientation';
import { boxFrame, createBoxFrame, snapByBounds } from '../utils/snapping';
import { stageCssScale } from '../utils/stageCssScale';
import { useTextEditorOpener } from '../utils/textEditorOpeners';

import type { SnapTarget } from '../utils/snapping';
import type Konva from 'konva';

// Rahmen für Snap und Geometrie-Meldung, pro Aufruf neu beschrieben (synchron, ohne Allokation).
const dragFrame = createBoxFrame();

export type BalkenMode = 'single' | 'triple';

export interface BalkenInstance {
  id: string;
  mode: BalkenMode;
  colorSchemeId: string;
  widthScale: number;
  offset: { x: number; y: number };
  scale: number;
  texts: string[];
  rotation: number;
  opacity?: number;
  barOffsets?: [number, number, number];
}

export interface BalkenGroupProps {
  /** Id des Elements — unter ihr öffnet „Text bearbeiten“ die erste Zeile. */
  id: string;
  /** Mode: 'single' for 1 bar, 'triple' for 3 bars */
  mode: BalkenMode;
  /** Color scheme ID from dreizeilenLayout */
  colorSchemeId: string;
  /** Custom texts for the bars */
  texts: string[];
  /** Position offset */
  offset: { x: number; y: number };
  /** Overall scale factor */
  scale: number;
  /** Width scale factor (stretches bars horizontally) */
  widthScale: number;
  /** Rotation in degrees */
  rotation: number;
  /** Whether this element is selected */
  selected: boolean;
  /** Called when element is selected */
  onSelect: () => void;
  /** Called when drag ends */
  onDragEnd: (x: number, y: number) => void;
  /** Called when transform ends */
  onTransformEnd: (x: number, y: number, scale: number, rotation: number) => void;
  /** Called during drag for snapping feedback */
  onSnapChange: (snapH: boolean, snapV: boolean) => void;
  /** Called with snap lines */
  onSnapLinesChange: (lines: unknown[]) => void;
  /** Get snap targets excluding this element */
  getSnapTargets: (excludeId: string) => SnapTarget[];
  /** Called when text is edited inline */
  onTextChange?: (index: number, text: string) => void;
  /** Canvas dimensions */
  stageWidth: number;
  stageHeight: number;
  /** Opacity (0-1) */
  opacity?: number;
  /** Per-line horizontal offsets for fine-tuning */
  barOffsets?: [number, number, number];
}

/**
 * BalkenGroupInner - Internal component implementation
 * Wrapped with memo() below for performance optimization
 */
function BalkenGroupInner({
  id,
  mode,
  colorSchemeId,
  texts,
  offset,
  scale,
  widthScale,
  rotation,
  selected,
  onSelect,
  onDragEnd,
  onTransformEnd,
  onSnapChange,
  onSnapLinesChange,
  getSnapTargets,
  onTextChange,
  stageWidth,
  stageHeight,
  opacity = 1,
  barOffsets,
}: BalkenGroupProps) {
  const locked = useIsItemLocked();
  const groupRef = useRef<Konva.Group>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const stopFollowingRef = useRef<(() => void) | null>(null);
  const placeEditorRef = useRef<() => void>(() => {});
  const textNodesRef = useRef<(Konva.Text | null)[]>([]);
  const startEditingRef = useRef<(index: number, from?: FocusOrigin | null) => void>(() => {});
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [liveText, setLiveText] = useState<{ index: number; text: string } | null>(null);

  const config = DREIZEILEN_CONFIG;

  // Die Balkenbreite ist eine React-seitige Messung gegen GrueneTypeNeue. Beim
  // ersten Öffnen ist die Schrift noch nicht da (ein Konva-Paint fordert sie
  // nicht an), also misst der erste Durchlauf Arial. Ohne diese Abhängigkeit
  // bliebe die zu breite Ersatzschrift-Breite bis zum nächsten Regler-Griff
  // stehen — siehe `useFontGeneration`.
  const fontGeneration = useFontGeneration();

  const fontSize = config.text.defaultFontSize;
  const colorScheme = useMemo(() => getColorScheme(colorSchemeId), [colorSchemeId]);

  // Merge props texts with live text for display
  const displayTexts = useMemo(() => {
    if (liveText && liveText.index !== null) {
      const newTexts = [...texts];
      // Fill gaps if texts array is sparse
      if (newTexts.length <= liveText.index) {
        // Ensure array is long enough (up to 3)
        // Actually spread covers indices 0..length-1.
        // We just assign.
      }
      newTexts[liveText.index] = liveText.text;
      return newTexts;
    }
    return texts;
  }, [texts, liveText]);

  const { balkens, bounds } = useMemo(
    () =>
      calculateBalkenLayouts(
        mode,
        widthScale,
        displayTexts,
        stageWidth,
        stageHeight,
        barOffsets,
        fontGeneration
      ),
    [mode, widthScale, displayTexts, stageWidth, stageHeight, barOffsets, fontGeneration]
  );

  // Attach transformer when selected
  useEffect(() => {
    if (selected && groupRef.current && transformerRef.current) {
      transformerRef.current.nodes([groupRef.current]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [selected]);

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

  // Lage des Felds aus Gruppe und Bühne, wie sie jetzt liegen: bei Layoutwechsel
  // (etwa wächst die Zeile beim Tippen) und wenn die Bühne wandert (`followStage`).
  const placeEditor = useCallback(() => {
    if (editingIndex === null || !inputRef.current || !groupRef.current) return;

    const stage = groupRef.current.getStage();
    if (!stage) return;

    const balken = balkens[editingIndex];
    // Cannot use textNode ref because there are multiple.
    // We calculate absolute position manually based on Group properties.

    const groupNode = groupRef.current;
    const transform = groupNode.getAbsoluteTransform().copy();

    // The text is positioned at (balken.x + skewOffset/2, balken.y) inside the group
    const skewAngle = config.balken.skewAngle;
    const skewRad = (skewAngle * Math.PI) / 180;
    const skewOffset = (balken.height * Math.tan(skewRad)) / 2;

    const localX = balken.x + skewOffset / 2;
    const localY = balken.y;

    const stageBox = stage.container().getBoundingClientRect();
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;

    const cssScale = stageCssScale(stage, stageBox);
    const scaleX = groupNode.getAbsoluteScale().x * cssScale;
    const scaleY = groupNode.getAbsoluteScale().y * cssScale;

    const input = inputRef.current;

    // Calculate vertical centering
    // Konva text is vertically centered in the bar height
    // We want input to hug the text content
    const lineHeight = 1.1; // Tighter line height
    const textHeight = fontSize * lineHeight;
    const verticalOffset = (balken.height - textHeight) / 2;

    // Die Ecke des Felds liegt auf der gedrehten Zeile; um sie dreht das Feld.
    const pos = transform.point({ x: localX, y: localY + verticalOffset });
    input.style.top = `${stageBox.top + scrollY + pos.y * cssScale}px`;
    input.style.left = `${stageBox.left + scrollX + pos.x * cssScale}px`;
    input.style.transform = `rotate(${normalizeRotation(groupNode.getAbsoluteRotation())}deg)`;
    input.style.width = `${balken.width * scaleX}px`;
    input.style.height = `${textHeight * scaleY}px`;
    input.style.lineHeight = String(lineHeight);
  }, [balkens, editingIndex, fontSize, config.balken.skewAngle]);

  useEffect(() => {
    placeEditorRef.current = placeEditor;
    placeEditor();
  }, [placeEditor, stageWidth, stageHeight]);

  const snap = useSnapScheduler({ onSnapChange, onSnapLinesChange });

  const handleDragMove = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      const node = e.currentTarget as Konva.Group;
      if (isGroupDrag(node)) return;
      const scaleX = node.scaleX();
      const scaleY = node.scaleY();

      const contentWidth = bounds.width * scaleX;
      const contentHeight = bounds.height * scaleY;

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
        getSnapTargets('balken-group'),
        stageWidth,
        stageHeight,
        snap.hysteresis
      );

      node.position({ x: result.x, y: result.y });

      snap.scheduleSnap(result.snapH, result.snapV, result.snapLines);
    },
    [bounds, getSnapTargets, stageWidth, stageHeight, snap]
  );

  const handleDragEnd = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      snap.onDragEnd();
      const centerX = bounds.left + bounds.width / 2;
      const centerY = bounds.top + bounds.height / 2;
      onDragEnd(e.target.x() - centerX, e.target.y() - centerY);
    },
    [onDragEnd, snap, bounds]
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

    const centerX = bounds.left + bounds.width / 2;
    const centerY = bounds.top + bounds.height / 2;
    const newOffset = { x: node.x() - centerX, y: node.y() - centerY };

    onTransformEnd(newOffset.x, newOffset.y, newScale, newRotation);
  }, [onTransformEnd, scale, rotation, bounds]);

  // Die Zeile `index` zum Bearbeiten öffnen. `from` reicht beim Weiterspringen
  // mit Tab den Ursprung der ersten Zeile durch — dorthin geht der Fokus am Ende.
  const startEditing = useCallback(
    (index: number, from: FocusOrigin | null = null) => {
      const textNode = textNodesRef.current[index];
      const stage = textNode?.getStage();
      if (!textNode || !stage) return;

      // Woher die Bearbeitung kam (Ebenen-Eintrag oder Seite) — dorthin geht der Fokus danach.
      const origin = from ?? captureFocusOrigin(stage.container());
      setEditingIndex(index);
      setLiveText({ index, text: textNode.text() });

      const stageBox = stage.container().getBoundingClientRect();
      const cssScale = stageCssScale(stage, stageBox);

      const absScale = textNode.getAbsoluteScale();
      const scaleX = absScale.x * cssScale;
      const scaleY = absScale.y * cssScale;

      // Je Zeile ein eigenes Feld: beim Weiterspringen steht das neue, bevor das
      // alte beim Blur übernimmt und abräumt — der Fokus fällt nie auf <body>.
      const input = document.createElement('input');
      document.body.appendChild(input);
      inputRef.current = input;
      const isCurrent = () => inputRef.current === input;

      const scrollX = window.scrollX || window.pageXOffset;
      const scrollY = window.scrollY || window.pageYOffset;

      // Vertical centering
      const lineHeight = 1.1;
      const fontSz = textNode.fontSize();
      const textH = fontSz * lineHeight;
      const nodeH = textNode.height(); // Full bar height
      const verticalOffset = (nodeH - textH) / 2;
      // Die Ecke des Felds liegt auf der gedrehten Zeile (Textknoten-Ursprung,
      // um die Leerhöhe eingerückt); um sie dreht das Feld mit.
      const corner = textNode.getAbsoluteTransform().point({ x: 0, y: verticalOffset });

      input.value = textNode.text();
      input.setAttribute('aria-label', `Zeile ${index + 1} bearbeiten`);
      input.style.position = 'absolute';
      input.style.top = `${stageBox.top + scrollY + corner.y * cssScale}px`;
      input.style.left = `${stageBox.left + scrollX + corner.x * cssScale}px`;
      input.style.width = `${textNode.width() * scaleX}px`;
      input.style.height = `${textH * scaleY}px`; // Match text height

      input.style.fontSize = `${fontSz * scaleY}px`;
      input.style.fontFamily = textNode.fontFamily();
      input.style.color = textNode.fill() as string;
      input.style.textAlign = 'center';
      input.style.lineHeight = String(lineHeight);

      input.style.border = 'none';
      input.style.padding = '0px';
      input.style.margin = '0';
      input.style.background = 'none';
      input.style.outline = '2px solid #0088cc';
      input.style.zIndex = '10000';
      input.style.transformOrigin = 'left top';
      input.style.transform = `rotate(${normalizeRotation(textNode.getAbsoluteRotation())}deg)`;

      input.focus();
      input.select();

      stopFollowingRef.current?.();
      stopFollowingRef.current = followStage(stage, () => placeEditorRef.current());

      let closed = false;
      const removeInput = () => {
        if (closed) return;
        closed = true;
        // Jede Zeile ist ein eigener Verlaufsschritt, wie beim Klick.
        onTextChange?.(index, input.value);
        if (document.body.contains(input)) document.body.removeChild(input);
        // Schon an die nächste Zeile weitergereicht: die gehört jetzt ihr.
        if (!isCurrent()) return;

        stopFollowingRef.current?.();
        stopFollowingRef.current = null;
        setEditingIndex(null);
        setLiveText(null);
        inputRef.current = null;
        returnFocus(origin);
      };

      const onInput = () => {
        setLiveText({ index, text: input.value });
      };

      input.addEventListener('input', onInput);
      input.addEventListener('blur', removeInput);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          input.blur();
        }
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          input.blur();
        }
        // Das Feld hängt am Ende von <body>: Tab führte von dort ins Nirgendwo.
        // Also springt Tab zur nächsten Zeile (Umschalt+Tab zur vorigen) und
        // schliesst erst hinter der letzten bzw. vor der ersten.
        if (e.key === 'Tab') {
          e.preventDefault();
          const next = index + (e.shiftKey ? -1 : 1);
          if (textNodesRef.current[next]) startEditingRef.current(next, origin);
          else input.blur();
        }
      });
    },
    [onTextChange]
  );

  useEffect(() => {
    startEditingRef.current = startEditing;
  }, [startEditing]);

  // „Text bearbeiten“ (F2, Enter in der Ebenen-Liste, Kontextmenü) beginnt mit Zeile 1.
  useTextEditorOpener(id, () => startEditingRef.current(0));

  const skewAngle = config.balken.skewAngle;

  const centerX = bounds.left + bounds.width / 2;
  const centerY = bounds.top + bounds.height / 2;
  const groupX = offset.x + centerX;
  const groupY = offset.y + centerY;

  return (
    <>
      <Group
        ref={groupRef}
        x={groupX}
        y={groupY}
        offsetX={centerX}
        offsetY={centerY}
        scaleX={scale}
        scaleY={scale}
        rotation={rotation}
        opacity={opacity}
        draggable={editingIndex === null && !locked} // Disable drag while editing
        onDragStart={snap.onDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        onTransformEnd={handleTransformEnd}
        onMouseDown={onSelect}
        onTouchStart={onSelect}
      >
        {balkens.map((balken, index) => {
          const colorPair = colorScheme.colors[balken.colorIndex % colorScheme.colors.length];
          const points = calculateParallelogramPoints(
            balken.x,
            balken.y,
            balken.width,
            balken.height,
            skewAngle
          );

          // Calculate skew offset for text positioning (same as DreizeilenCanvas)
          const skewRad = (skewAngle * Math.PI) / 180;
          const skewOffset = (balken.height * Math.tan(skewRad)) / 2;
          const isEditingThis = editingIndex === index;

          return (
            // eslint-disable-next-line react/no-array-index-key -- bars are fixed slots edited by index; order is the identity
            <Group key={index}>
              <Line points={flattenPoints(points)} closed fill={colorPair.background} />
              <Text
                text={balken.text}
                x={balken.x + skewOffset / 2}
                y={balken.y}
                width={balken.width}
                height={balken.height}
                wrap="none"
                fontSize={fontSize}
                fontFamily={`${config.text.fontFamily}, Arial, sans-serif`}
                fill={colorPair.text}
                align="center"
                verticalAlign="middle"
                listening={true} // Must listen for events
                ref={(node) => {
                  textNodesRef.current[index] = node;
                }}
                onDblClick={() => startEditing(index)}
                onDblTap={() => startEditing(index)}
                visible={!isEditingThis} // Hide text while editing
              />
            </Group>
          );
        })}

        {/* Selection indicator */}
        {selected && editingIndex === null && (
          <Rect
            name="selection-chrome"
            x={bounds.left - 4}
            y={bounds.top - 4}
            width={bounds.width + 8}
            height={bounds.height + 8}
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
 * Memoized BalkenGroup - Prevents re-renders when only callbacks change
 *
 * Uses shallow comparison for data props. Callbacks are considered stable
 * since they're created with useCallback in parent hooks.
 */
export const BalkenGroup = memo(BalkenGroupInner, (prevProps, nextProps) => {
  // Compare data props - if any change, re-render
  if (prevProps.id !== nextProps.id) return false;
  if (prevProps.mode !== nextProps.mode) return false;
  if (prevProps.colorSchemeId !== nextProps.colorSchemeId) return false;
  if (prevProps.widthScale !== nextProps.widthScale) return false;
  if (prevProps.rotation !== nextProps.rotation) return false;
  if (prevProps.scale !== nextProps.scale) return false;
  if (prevProps.selected !== nextProps.selected) return false;
  if (prevProps.stageWidth !== nextProps.stageWidth) return false;
  if (prevProps.stageHeight !== nextProps.stageHeight) return false;
  if (prevProps.opacity !== nextProps.opacity) return false;

  // Compare offset object
  if (prevProps.offset.x !== nextProps.offset.x || prevProps.offset.y !== nextProps.offset.y)
    return false;

  // Compare texts array (shallow)
  if (prevProps.texts.length !== nextProps.texts.length) return false;
  for (let i = 0; i < prevProps.texts.length; i++) {
    if (prevProps.texts[i] !== nextProps.texts[i]) return false;
  }

  // Compare barOffsets array if present
  if (prevProps.barOffsets !== nextProps.barOffsets) {
    if (!prevProps.barOffsets || !nextProps.barOffsets) return false;
    for (let i = 0; i < 3; i++) {
      if (prevProps.barOffsets[i] !== nextProps.barOffsets[i]) return false;
    }
  }

  // Callbacks are considered stable - don't trigger re-render for callback changes
  return true;
});

BalkenGroup.displayName = 'BalkenGroup';

export default BalkenGroup;
