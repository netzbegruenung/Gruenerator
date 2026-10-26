/**
 * GenericCanvasElement - Memoized renderer for config-driven canvas elements
 *
 * World-class memoization strategy:
 * 1. Each element type has its own memoized sub-component
 * 2. Props are compared shallowly for primitives, deeply for objects
 * 3. Callbacks are stabilized via useCallback in parent
 */

import React, { memo, useCallback, useMemo } from 'react';
import { Group, Rect, Circle, Text } from 'react-konva';
import useImage from 'use-image';

import { surfaceGlow } from '../brand/theme';
import { type GeometryReporter } from '../hooks/useGeometryReporter';
import { CanvasText, CanvasImage, CanvasBackground } from '../primitives';
import {
  useCanvasStore,
  useCanvasStoreSelector,
  useIsElementSelected,
} from '../stores/CanvasStoreProvider';
import { canCropBackgroundPhoto, imageElementInteraction } from '../utils/backgroundPhotoCrop';
import { canvasImageSourceUrl } from '../utils/canvasImageSource';
import { imageRenderInputsAreEqual } from '../utils/imageElementComparison';
import { backgroundAdjustments } from '../utils/imageFilters';
import { useTrackPendingImage } from '../utils/pendingImages';
import { BACKGROUND_IMAGE_NODE_ID } from '../utils/printImageInfo';
// Die Aufloesung von x/y/width/height/opacity steht seit #3403 ausserhalb:
// `templateElementToEntry` braucht dieselbe Rechnung, und zwei Fassungen
// derselben Arithmetik driften auseinander.
import { resolveColor, resolveImageElementBox, resolveValue } from '../utils/resolveElementValue';
import {
  assertAsString,
  assertAsNumber,
  assertAsPosition,
  assertAsOpacity,
  getStateValue,
  getOptionalStateValue,
} from '../utils/stateTypeAssertions';
import { isTemplateElementRotatable, templateRotationOf } from '../utils/templateRotation';
import { templateTextAlignOf } from '../utils/textAlign';

import type {
  CanvasElementConfig,
  TextElementConfig,
  ImageElementConfig,
  RectElementConfig,
  CircleElementConfig,
  GroupElementConfig,
  BackgroundElementConfig,
  LayoutResult,
  PositionValue,
} from '../configs/types';
import type { SnapTarget, SnapLine } from '../utils/snapping';

// ============================================================================
// MEMOIZED TEXT ELEMENT
// ============================================================================

interface MemoizedTextProps<TState extends Record<string, unknown> = Record<string, unknown>> {
  config: TextElementConfig<TState>;
  state: TState;
  layout: LayoutResult;
  selected: boolean;
  onSelect: (id: string) => void;
  onTextChange: (id: string, text: string) => void;
  onFontSizeChange: (id: string, size: number) => void;
  onPositionChange: (id: string, x: number, y: number, w: number, h: number) => void;
  onTemplateTransformEnd: (id: string, x: number, y: number, rotation: number) => void;
  onGeometryChange?: GeometryReporter;
  onSnapChange: (snapH: boolean, snapV: boolean) => void;
  onSnapLinesChange: (lines: SnapLine[]) => void;
  stageWidth: number;
  stageHeight: number;
  getSnapTargets: (excludeId: string) => SnapTarget[];
}

const MemoizedTextElement = memo(
  function MemoizedTextElement<TState extends Record<string, unknown> = Record<string, unknown>>({
    config,
    state,
    layout,
    selected,
    onSelect,
    onTextChange,
    onFontSizeChange,
    onPositionChange,
    onTemplateTransformEnd,
    onGeometryChange,
    onSnapChange,
    onSnapLinesChange,
    stageWidth,
    stageHeight,
    getSnapTargets,
  }: MemoizedTextProps<TState>) {
    const text = assertAsString(state[config.textKey]);
    const customFontSize = getOptionalStateValue<number>(state, config.fontSizeStateKey);
    const customWidth = getOptionalStateValue<number>(state, config.widthStateKey);
    // null/undefined means "no manual override — use the computed layout".
    // assertAsPosition's {0,0} fallback must NOT kick in here, or every
    // element with a positionStateKey but no stored position would render
    // at the canvas origin.
    const rawCustomPosition = config.positionStateKey ? state[config.positionStateKey] : null;
    const customPosition = rawCustomPosition != null ? assertAsPosition(rawCustomPosition) : null;

    const layoutItem = layout[config.id];
    const x = customPosition?.x ?? resolveValue(config.x, state, layout);
    const y = customPosition?.y ?? resolveValue(config.y, state, layout);
    const width = customWidth ?? resolveValue(config.width, state, layout);
    const fontSize = customFontSize ?? resolveValue(config.fontSize, state, layout);
    const customOpacity = getOptionalStateValue<number>(state, config.opacityStateKey);
    const opacity = assertAsOpacity(
      customOpacity ?? (config.opacity ? resolveValue(config.opacity, state, layout) : 1)
    );
    const fill = resolveColor(config.fill, state, layout);

    // Extract padding from config (support both absolute pixels and fontSize factor)
    const rawPadding = config.padding ? resolveValue(config.padding, state, layout) : 0;
    const padding =
      rawPadding < 1 && rawPadding > 0
        ? fontSize * rawPadding // Treat as factor if 0 < padding < 1
        : rawPadding; // Otherwise use absolute pixels

    const handleSelect = useCallback(() => onSelect(config.id), [onSelect, config.id]);
    const handleTextChange = useCallback(
      (newText: string) => onTextChange(config.id, newText),
      [onTextChange, config.id]
    );
    const handleFontSizeChange = useCallback(
      (size: number) => onFontSizeChange(config.id, size),
      [onFontSizeChange, config.id]
    );
    // Only a text whose position persists may turn: Konva turns about the
    // top-left corner, so the turn moves x/y too.
    const rotatable = isTemplateElementRotatable(config);
    const rotation = rotatable ? templateRotationOf(state, config.id) : 0;
    const handleTransformEnd = useCallback(
      (newX: number, newY: number, _w: number, _sx: number, _sy: number, newRotation: number) =>
        onTemplateTransformEnd(config.id, newX, newY, newRotation),
      [onTemplateTransformEnd, config.id]
    );

    return (
      <CanvasText
        id={config.id}
        text={text}
        x={x}
        y={y}
        width={width}
        fontSize={fontSize}
        fontFamily={config.fontFamily}
        fontStyle={config.fontStyle}
        fill={fill}
        align={templateTextAlignOf(state, config.id) ?? config.align ?? 'left'}
        lineHeight={config.lineHeight ?? 1.2}
        wrap={config.wrap ?? 'word'}
        padding={padding}
        draggable={config.draggable ?? false}
        editable={config.editable ?? false}
        richText={config.richText ?? false}
        opacity={opacity}
        selected={selected}
        onSelect={handleSelect}
        onTextChange={handleTextChange}
        onFontSizeChange={handleFontSizeChange}
        stageWidth={stageWidth}
        stageHeight={stageHeight}
        onSnapChange={onSnapChange}
        getSnapTargets={getSnapTargets}
        onPositionChange={onPositionChange}
        onGeometryChange={onGeometryChange}
        onSnapLinesChange={onSnapLinesChange}
        rotation={rotation}
        transformConfig={{ rotateEnabled: rotatable }}
        {...(rotatable ? { onTransformEnd: handleTransformEnd } : {})}
      />
    );
  },
  (prev, next) => {
    // Custom comparison for optimal memoization
    if (prev.config.id !== next.config.id) return false;
    if (prev.selected !== next.selected) return false;
    if (prev.stageWidth !== next.stageWidth) return false;
    if (prev.stageHeight !== next.stageHeight) return false;

    // Compare relevant state keys
    const textKey = prev.config.textKey;
    if (prev.state[textKey] !== next.state[textKey]) return false;

    const fontSizeKey = prev.config.fontSizeStateKey;
    if (fontSizeKey && prev.state[fontSizeKey] !== next.state[fontSizeKey]) return false;

    const widthKey = prev.config.widthStateKey;
    if (widthKey && prev.state[widthKey] !== next.state[widthKey]) return false;

    const posKey = prev.config.positionStateKey;
    if (posKey) {
      const prevPos = assertAsPosition(prev.state[posKey]);
      const nextPos = assertAsPosition(next.state[posKey]);
      if (prevPos.x !== nextPos.x || prevPos.y !== nextPos.y) return false;
    }

    const opacityKey = prev.config.opacityStateKey;
    if (opacityKey && prev.state[opacityKey] !== next.state[opacityKey]) return false;

    const fillKey = prev.config.fillStateKey;
    if (fillKey && prev.state[fillKey] !== next.state[fillKey]) return false;

    if (
      templateRotationOf(prev.state, prev.config.id) !==
      templateRotationOf(next.state, next.config.id)
    ) {
      return false;
    }
    if (
      templateTextAlignOf(prev.state, prev.config.id) !==
      templateTextAlignOf(next.state, next.config.id)
    ) {
      return false;
    }

    // Compare layout
    const prevLayout = prev.layout[prev.config.id];
    const nextLayout = next.layout[next.config.id];
    if (prevLayout?.x !== nextLayout?.x || prevLayout?.y !== nextLayout?.y) return false;
    if (prevLayout?.fontSize !== nextLayout?.fontSize) return false;

    // Compare padding config
    if (prev.config.padding !== next.config.padding) return false;

    // Compare layout padding if present
    if (prevLayout?.padding !== nextLayout?.padding) return false;

    return true;
  }
);

// ============================================================================
// MEMOIZED IMAGE ELEMENT
// ============================================================================

interface MemoizedImageProps<TState extends Record<string, unknown> = Record<string, unknown>> {
  config: ImageElementConfig<TState>;
  state: TState;
  layout: LayoutResult;
  selected: boolean;
  onSelect: (id: string) => void;
  onDragEnd: (id: string, x: number, y: number) => void;
  onTransformEnd: (
    id: string,
    x: number,
    y: number,
    w: number,
    h: number,
    rotation: number
  ) => void;
  onPositionChange?: (id: string, x: number, y: number, w: number, h: number) => void;
  onGeometryChange?: GeometryReporter;
  stageWidth: number;
  stageHeight: number;
  onSnapChange: (snapH: boolean, snapV: boolean) => void;
  onSnapLinesChange: (lines: SnapLine[]) => void;
  getSnapTargets: (excludeId: string) => SnapTarget[];
}

const MemoizedImageElement = memo(function MemoizedImageElement<
  TState extends Record<string, unknown> = Record<string, unknown>,
>({
  config,
  state,
  layout,
  selected,
  onSelect,
  onDragEnd,
  onTransformEnd,
  onPositionChange,
  onGeometryChange,
  stageWidth,
  stageHeight,
  onSnapChange,
  onSnapLinesChange,
  getSnapTargets,
}: MemoizedImageProps<TState>) {
  // Resolve image source
  let imageSrc: string | undefined;
  if (config.srcKey) {
    imageSrc = getOptionalStateValue<string>(state, config.srcKey);
  } else if (config.src) {
    imageSrc = typeof config.src === 'function' ? config.src(state) : config.src;
  }

  // `sizeStateKey` wurde bisher nur geschrieben (handleImageTransformEnd) und
  // nie gelesen — Groessenaenderungen an Profilbild und Sonnenblume fielen
  // beim naechsten Neuzeichnen zurueck.
  const { x, y, width, height, opacity } = resolveImageElementBox(config, state, layout);

  // Render the server's working-size WebP variant instead of the raw original:
  // the original is kept on disk for the gallery, but loading multi-MB
  // full-resolution bytes made background swaps feel endless. The variant is
  // only export-quality while the element draws narrow enough; wider (zoomed
  // or resized) elements load the stored original instead.
  const sourceUrl = canvasImageSourceUrl(imageSrc, width) ?? '';
  const [image, status] = useImage(sourceUrl, 'anonymous');
  useTrackPendingImage(config.id, sourceUrl, status);

  const isBackgroundPhoto = config.id === BACKGROUND_IMAGE_NODE_ID;
  const cropping = useCanvasStoreSelector(
    (s) => isBackgroundPhoto && s.croppingElement === config.id
  );
  const interaction = imageElementInteraction(config, { cropping });
  const store = useCanvasStore();
  const handleToggleCrop = useCallback(() => {
    const s = store.getState();
    if (s.croppingElement === config.id) {
      s.setCroppingElement(null);
      return;
    }
    // Direkt in den Store: der Auswahl-Pfad schiebt in einer Mehrfachauswahl auf.
    if (s.selectedElement !== config.id) s.setSelectedElement(config.id);
    store.getState().setCroppingElement(config.id);
  }, [store, config.id]);
  const customFill = getOptionalStateValue<string>(state, config.fillStateKey);
  const fill = customFill ?? resolveColor(config.fill, state, layout);

  const handleSelect = useCallback(() => onSelect(config.id), [onSelect, config.id]);
  const handleDragEnd = useCallback(
    (newX: number, newY: number) => onDragEnd(config.id, newX, newY),
    [onDragEnd, config.id]
  );
  const handleTransformEnd = useCallback(
    (newX: number, newY: number, w: number, h: number, rotation: number) =>
      onTransformEnd(config.id, newX, newY, w, h, rotation),
    [onTransformEnd, config.id]
  );
  // CI marks turn but never mirror; the background photo and cover fits never turn.
  const rotatable = isTemplateElementRotatable(config);
  const rotation = rotatable ? templateRotationOf(state, config.id) : 0;

  if (!image) return null;

  // The slot the photo fills: the element's own box before zoom and pan.
  const frame = config.coverFit
    ? (config.frame?.(state, layout) ?? {
        x: resolveValue(config.x, state, layout),
        y: resolveValue(config.y, state, layout),
        width: resolveValue(config.width, state, layout),
        height: resolveValue(config.height, state, layout),
      })
    : null;

  return (
    <CanvasImage
      id={config.id}
      image={image}
      x={x}
      y={y}
      width={width}
      height={height}
      rotation={rotation}
      opacity={opacity}
      color={typeof fill === 'string' ? fill : undefined}
      adjustments={config.id === BACKGROUND_IMAGE_NODE_ID ? backgroundAdjustments(state) : null}
      coverFit={config.coverFit}
      frame={frame}
      draggable={interaction.draggable}
      touchDragNeedsSelection={isBackgroundPhoto}
      onToggleCrop={canCropBackgroundPhoto(config) ? handleToggleCrop : null}
      cropping={cropping}
      selected={selected}
      onSelect={handleSelect}
      onDragEnd={handleDragEnd}
      onTransformEnd={handleTransformEnd}
      stageWidth={stageWidth}
      stageHeight={stageHeight}
      onSnapChange={onSnapChange}
      getSnapTargets={getSnapTargets}
      onPositionChange={onPositionChange}
      onGeometryChange={onGeometryChange}
      onSnapLinesChange={onSnapLinesChange}
      listening={config.listening}
      constrainToBounds={config.constrainToBounds ?? true}
      transformConfig={{
        // A non-transformable image shows no resize handles. Without
        // this, CanvasImage falls back to DEFAULT_IMAGE_ANCHORS, so a selectable
        // but non-transformable slot (e.g. the veranstaltung photo band,
        // draggable: false) would still expose all four corner handles and let a
        // user resize/move it via the Transformer — writing an unbounded
        // offset/scale straight past the centerZoom/coverFit assumptions.
        enabledAnchors: interaction.transformable
          ? ['top-left', 'top-right', 'bottom-left', 'bottom-right']
          : [],
        rotateEnabled: rotatable,
        keepRatio: true,
      }}
    />
  );
}, imageRenderInputsAreEqual);

// ============================================================================
// MEMOIZED RECT ELEMENT
// ============================================================================

interface MemoizedRectProps<TState extends Record<string, unknown> = Record<string, unknown>> {
  config: RectElementConfig<TState>;
  state: TState;
  layout: LayoutResult;
}

const MemoizedRectElement = memo(function MemoizedRectElement<
  TState extends Record<string, unknown> = Record<string, unknown>,
>({ config, state, layout }: MemoizedRectProps<TState>) {
  const x = resolveValue(config.x, state, layout);
  const y = resolveValue(config.y, state, layout);
  const width = resolveValue(config.width, state, layout);
  const height = resolveValue(config.height, state, layout);
  const fill = resolveColor(config.fill, state, layout);

  // Resolve cornerRadius - can be static number, array, or derived from state
  let cornerRadius: number | number[] | undefined;
  if (config.cornerRadius !== undefined) {
    if (Array.isArray(config.cornerRadius)) {
      cornerRadius = config.cornerRadius;
    } else {
      cornerRadius = resolveValue(
        config.cornerRadius as number | ((s: TState, l: LayoutResult) => number),
        state,
        layout
      );
    }
  }

  return (
    <Rect
      x={x}
      y={y}
      width={width}
      height={height}
      fill={fill}
      fillLinearGradientStartPoint={config.fillLinearGradientStartPoint}
      fillLinearGradientEndPoint={config.fillLinearGradientEndPoint}
      fillLinearGradientColorStops={config.fillLinearGradientColorStops}
      // Ohne das gewinnt in Konva immer `fill` — die Vorgabe für fillPriority
      // ist 'color', der Verlauf bliebe unsichtbar.
      fillPriority={config.fillLinearGradientColorStops ? 'linear-gradient' : 'color'}
      cornerRadius={cornerRadius}
      listening={config.listening ?? false}
      draggable={config.draggable ?? false}
    />
  );
});

// ============================================================================
// MEMOIZED CIRCLE ELEMENT
// ============================================================================

interface MemoizedCircleProps<TState extends Record<string, unknown> = Record<string, unknown>> {
  config: CircleElementConfig<TState>;
  state: TState;
  layout: LayoutResult;
}

const MemoizedCircleElement = memo(function MemoizedCircleElement<
  TState extends Record<string, unknown> = Record<string, unknown>,
>({ config, state, layout }: MemoizedCircleProps<TState>) {
  const x = resolveValue(config.x, state, layout);
  const y = resolveValue(config.y, state, layout);
  const radius = resolveValue(config.radius, state, layout);
  const fill = resolveColor(config.fill, state, layout);

  return <Circle x={x} y={y} radius={radius} fill={fill} rotation={config.rotation} />;
});

// ============================================================================
// MEMOIZED BACKGROUND ELEMENT
// ============================================================================

interface MemoizedBackgroundProps<
  TState extends Record<string, unknown> = Record<string, unknown>,
> {
  config: BackgroundElementConfig<TState>;
  state: TState;
  onSelect: (id: string) => void;
}

const MemoizedBackgroundElement = memo(function MemoizedBackgroundElement<
  TState extends Record<string, unknown> = Record<string, unknown>,
>({ config, state, onSelect }: MemoizedBackgroundProps<TState>) {
  // Selecting the plane opens its colour and photo controls in the context bar.
  const handleSelect = useCallback(() => onSelect(config.id), [onSelect, config.id]);

  // Der Typ bietet zwei Schlüssel an: `colorKey` (slider) und `fillStateKey`
  // (freeform). Gelesen wurde nur der erste, deshalb blieb der
  // Freeform-Hintergrund unabhängig von der Farbwahl immer weiß.
  const stateKey = config.colorKey ?? config.fillStateKey;
  const color =
    (stateKey ? getOptionalStateValue<string>(state, stateKey) : undefined) ??
    config.color ??
    '#ffffff';

  const glow = surfaceGlow(color);

  return (
    <CanvasBackground
      width={config.width}
      height={config.height}
      color={color}
      onSelect={handleSelect}
      {...(glow
        ? {
            gradient: {
              type: 'radial' as const,
              colorStops: glow.map((c, i) => ({ offset: i / (glow.length - 1), color: c })),
            },
          }
        : {})}
    />
  );
});

// ============================================================================
// MAIN ELEMENT RENDERER
// ============================================================================

export interface GenericCanvasElementProps<
  TState extends Record<string, unknown> = Record<string, unknown>,
> {
  config: CanvasElementConfig<TState>;
  state: TState;
  layout: LayoutResult;
  onSelect: (id: string) => void;
  onTextChange: (id: string, text: string) => void;
  onFontSizeChange: (id: string, size: number) => void;
  onPositionChange: (id: string, x: number, y: number, w: number, h: number) => void;
  /** Meldet gerenderte Geometrie als Snap-Ziel (ohne den Zustand anzufassen). */
  onGeometryChange?: GeometryReporter;
  onImageDragEnd: (id: string, x: number, y: number) => void;
  onImageTransformEnd: (
    id: string,
    x: number,
    y: number,
    w: number,
    h: number,
    rotation: number
  ) => void;
  /** Vorlagen-Text nach dem Transformer: Position und Drehung. */
  onTemplateTransformEnd: (id: string, x: number, y: number, rotation: number) => void;
  onSnapChange: (snapH: boolean, snapV: boolean) => void;
  onSnapLinesChange: (lines: SnapLine[]) => void;
  stageWidth: number;
  stageHeight: number;
  getSnapTargets: (excludeId: string) => SnapTarget[];
}

export const GenericCanvasElement = memo(function GenericCanvasElement<
  TState extends Record<string, unknown> = Record<string, unknown>,
>({
  config,
  state,
  layout,
  onSelect,
  onTextChange,
  onFontSizeChange,
  onPositionChange,
  onGeometryChange,
  onImageDragEnd,
  onImageTransformEnd,
  onTemplateTransformEnd,
  onSnapChange,
  onSnapLinesChange,
  stageWidth,
  stageHeight,
  getSnapTargets,
}: GenericCanvasElementProps<TState>) {
  const selected = useIsElementSelected(config.id);

  // Check visibility
  if (config.visible && !config.visible(state)) {
    return null;
  }

  switch (config.type) {
    case 'text':
      return (
        <MemoizedTextElement
          config={config as TextElementConfig<Record<string, unknown>>}
          state={state as Record<string, unknown>}
          layout={layout}
          selected={selected}
          onSelect={onSelect}
          onTextChange={onTextChange}
          onFontSizeChange={onFontSizeChange}
          onPositionChange={onPositionChange}
          onTemplateTransformEnd={onTemplateTransformEnd}
          onGeometryChange={onGeometryChange}
          onSnapChange={onSnapChange}
          onSnapLinesChange={onSnapLinesChange}
          stageWidth={stageWidth}
          stageHeight={stageHeight}
          getSnapTargets={getSnapTargets}
        />
      );

    case 'image':
      return (
        <MemoizedImageElement
          config={config as ImageElementConfig<Record<string, unknown>>}
          state={state as Record<string, unknown>}
          layout={layout}
          selected={selected}
          onSelect={onSelect}
          onDragEnd={onImageDragEnd}
          onTransformEnd={onImageTransformEnd}
          onPositionChange={onPositionChange}
          onGeometryChange={onGeometryChange}
          stageWidth={stageWidth}
          stageHeight={stageHeight}
          onSnapChange={onSnapChange}
          onSnapLinesChange={onSnapLinesChange}
          getSnapTargets={getSnapTargets}
        />
      );

    case 'rect':
      return (
        <MemoizedRectElement
          config={config as RectElementConfig<Record<string, unknown>>}
          state={state as Record<string, unknown>}
          layout={layout}
        />
      );

    case 'circle':
      return (
        <MemoizedCircleElement
          config={config as CircleElementConfig<Record<string, unknown>>}
          state={state as Record<string, unknown>}
          layout={layout}
        />
      );

    case 'background':
      return (
        <MemoizedBackgroundElement
          config={config as BackgroundElementConfig<Record<string, unknown>>}
          state={state as Record<string, unknown>}
          onSelect={onSelect}
        />
      );

    case 'group':
      // Groups recursively render children
      return (
        <Group
          x={resolveValue(config.x, state, layout)}
          y={resolveValue(config.y, state, layout)}
          rotation={config.rotation}
          clipFunc={
            config.clip
              ? (ctx) => {
                  ctx.rect(config.clip!.x, config.clip!.y, config.clip!.width, config.clip!.height);
                }
              : undefined
          }
        >
          {config.children.map((child) => (
            <GenericCanvasElement
              key={child.id}
              config={child}
              state={state}
              layout={layout}
              onSelect={onSelect}
              onTextChange={onTextChange}
              onFontSizeChange={onFontSizeChange}
              onPositionChange={onPositionChange}
              onGeometryChange={onGeometryChange}
              onImageDragEnd={onImageDragEnd}
              onImageTransformEnd={onImageTransformEnd}
              onTemplateTransformEnd={onTemplateTransformEnd}
              onSnapChange={onSnapChange}
              onSnapLinesChange={onSnapLinesChange}
              stageWidth={stageWidth}
              stageHeight={stageHeight}
              getSnapTargets={getSnapTargets}
            />
          ))}
        </Group>
      );

    default: {
      const exhaustiveCheck: never = config;
      const unknownType = (exhaustiveCheck as { type?: string } | null)?.type ?? 'undefined';
      const message = `GenericCanvasElement: unhandled element type "${unknownType}"`;
      if (process.env.NODE_ENV !== 'production') {
        throw new Error(message);
      }
      console.warn(message);
      return null;
    }
  }
});

export default GenericCanvasElement;
