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

import { CanvasText, CanvasImage, CanvasBackground } from '../primitives';
import {
  assertAsString,
  assertAsNumber,
  assertAsBoolean,
  assertAsPosition,
  assertAsOpacity,
  assertAsScale,
  getStateValue,
  getOptionalStateValue,
} from '../utils/stateTypeAssertions';

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
// UTILITY FUNCTIONS
// ============================================================================

/** Resolve a position value (static or derived) */
function resolveValue<T, TState extends Record<string, unknown> = Record<string, unknown>>(
  value: T | ((state: TState, layout: LayoutResult) => T),
  state: TState,
  layout: LayoutResult
): T {
  if (typeof value === 'function') {
    return (value as (state: TState, layout: LayoutResult) => T)(state, layout);
  }
  return value;
}

/** Resolve a color value (static or derived) */
function resolveColor<TState extends Record<string, unknown> = Record<string, unknown>>(
  value: string | ((state: TState, layout: LayoutResult) => string) | undefined,
  state: TState,
  layout: LayoutResult
): string | undefined {
  if (typeof value === 'function') {
    return (value as (state: TState, layout: LayoutResult) => string)(state, layout);
  }
  return value;
}

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
  onSnapChange: (snapH: boolean, snapV: boolean) => void;
  onSnapLinesChange: (lines: SnapLine[]) => void;
  stageWidth: number;
  stageHeight: number;
  snapTargets: SnapTarget[];
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
    onSnapChange,
    onSnapLinesChange,
    stageWidth,
    stageHeight,
    snapTargets,
  }: MemoizedTextProps<TState>) {
    const text = assertAsString(state[config.textKey]);
    const customFontSize = getOptionalStateValue<number>(state, config.fontSizeStateKey);
    const customWidth = getOptionalStateValue<number>(state, config.widthStateKey);
    const customPosition = config.positionStateKey
      ? assertAsPosition(state[config.positionStateKey])
      : null;

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
        align={config.align ?? 'left'}
        lineHeight={config.lineHeight ?? 1.2}
        wrap={config.wrap ?? 'word'}
        padding={padding}
        draggable={config.draggable ?? false}
        editable={config.editable ?? false}
        opacity={opacity}
        selected={selected}
        onSelect={handleSelect}
        onTextChange={handleTextChange}
        onFontSizeChange={handleFontSizeChange}
        stageWidth={stageWidth}
        stageHeight={stageHeight}
        onSnapChange={onSnapChange}
        snapTargets={snapTargets}
        onPositionChange={onPositionChange}
        onSnapLinesChange={onSnapLinesChange}
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
  onTransformEnd: (id: string, x: number, y: number, w: number, h: number) => void;
  stageWidth: number;
  stageHeight: number;
  onSnapChange: (snapH: boolean, snapV: boolean) => void;
  onSnapLinesChange: (lines: SnapLine[]) => void;
  snapTargets: SnapTarget[];
}

const MemoizedImageElement = memo(
  function MemoizedImageElement<TState extends Record<string, unknown> = Record<string, unknown>>({
    config,
    state,
    layout,
    selected,
    onSelect,
    onDragEnd,
    onTransformEnd,
    stageWidth,
    stageHeight,
    onSnapChange,
    onSnapLinesChange,
    snapTargets,
  }: MemoizedImageProps<TState>) {
    // Resolve image source
    let imageSrc: string | undefined;
    if (config.srcKey) {
      imageSrc = getOptionalStateValue<string>(state, config.srcKey);
    } else if (config.src) {
      imageSrc = typeof config.src === 'function' ? config.src(state) : config.src;
    }

    const [image] = useImage(imageSrc || '', 'anonymous');

    const offset = config.offsetKey ? assertAsPosition(state[config.offsetKey]) : { x: 0, y: 0 };
    const scale = config.scaleKey ? assertAsScale(state[config.scaleKey]) : 1;
    const isLocked = config.lockedKey ? assertAsBoolean(state[config.lockedKey]) : false;
    const customOpacity = getOptionalStateValue<number>(state, config.opacityStateKey);
    const opacity = assertAsOpacity(
      customOpacity ?? (config.opacity ? resolveValue(config.opacity, state, layout) : 1)
    );
    const customFill = getOptionalStateValue<string>(state, config.fillStateKey);
    const fill = customFill ?? resolveColor(config.fill, state, layout);

    const x = resolveValue(config.x, state, layout) + offset.x;
    const y = resolveValue(config.y, state, layout) + offset.y;
    const width = resolveValue(config.width, state, layout) * scale;
    const height = resolveValue(config.height, state, layout) * scale;

    const handleSelect = useCallback(() => onSelect(config.id), [onSelect, config.id]);
    const handleDragEnd = useCallback(
      (newX: number, newY: number) => onDragEnd(config.id, newX, newY),
      [onDragEnd, config.id]
    );
    const handleTransformEnd = useCallback(
      (newX: number, newY: number, w: number, h: number) =>
        onTransformEnd(config.id, newX, newY, w, h),
      [onTransformEnd, config.id]
    );

    if (!image) return null;

    return (
      <CanvasImage
        id={config.id}
        image={image}
        x={x}
        y={y}
        width={width}
        height={height}
        opacity={opacity}
        color={typeof fill === 'string' ? fill : undefined}
        draggable={config.draggable && !isLocked}
        selected={selected}
        onSelect={handleSelect}
        onDragEnd={handleDragEnd}
        onTransformEnd={handleTransformEnd}
        stageWidth={stageWidth}
        stageHeight={stageHeight}
        onSnapChange={onSnapChange}
        snapTargets={snapTargets}
        onSnapLinesChange={onSnapLinesChange}
        listening={config.listening}
        constrainToBounds={config.constrainToBounds ?? true}
        transformConfig={
          config.transformable
            ? {
                enabledAnchors: isLocked
                  ? []
                  : ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
                rotateEnabled: false,
                keepRatio: true,
              }
            : undefined
        }
      />
    );
  },
  (prev, next) => {
    if (prev.config.id !== next.config.id) return false;
    if (prev.selected !== next.selected) return false;

    const srcKey = prev.config.srcKey;
    if (srcKey && prev.state[srcKey] !== next.state[srcKey]) return false;

    const offsetKey = prev.config.offsetKey;
    if (offsetKey) {
      const prevOffset = assertAsPosition(prev.state[offsetKey]);
      const nextOffset = assertAsPosition(next.state[offsetKey]);
      if (prevOffset.x !== nextOffset.x || prevOffset.y !== nextOffset.y) return false;
    }

    const scaleKey = prev.config.scaleKey;
    if (scaleKey && prev.state[scaleKey] !== next.state[scaleKey]) return false;

    const lockedKey = prev.config.lockedKey;
    if (lockedKey && prev.state[lockedKey] !== next.state[lockedKey]) return false;

    const opacityKey = prev.config.opacityStateKey;
    if (opacityKey && prev.state[opacityKey] !== next.state[opacityKey]) return false;

    const fillKey = prev.config.fillStateKey;
    if (fillKey && prev.state[fillKey] !== next.state[fillKey]) return false;

    return true;
  }
);

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
      cornerRadius = resolveValue(config.cornerRadius as number | ((s: TState, l: LayoutResult) => number), state, layout);
    }
  }

  return (
    <Rect
      x={x}
      y={y}
      width={width}
      height={height}
      fill={fill}
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
}

const MemoizedBackgroundElement = memo(function MemoizedBackgroundElement<
  TState extends Record<string, unknown> = Record<string, unknown>,
>({ config, state }: MemoizedBackgroundProps<TState>) {
  const color = config.colorKey
    ? (getOptionalStateValue<string>(state, config.colorKey) ?? config.color ?? '#ffffff')
    : (config.color ?? '#ffffff');

  return <CanvasBackground width={config.width} height={config.height} color={color} />;
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
  selectedElement: string | null;
  onSelect: (id: string) => void;
  onTextChange: (id: string, text: string) => void;
  onFontSizeChange: (id: string, size: number) => void;
  onPositionChange: (id: string, x: number, y: number, w: number, h: number) => void;
  onImageDragEnd: (id: string, x: number, y: number) => void;
  onImageTransformEnd: (id: string, x: number, y: number, w: number, h: number) => void;
  onSnapChange: (snapH: boolean, snapV: boolean) => void;
  onSnapLinesChange: (lines: SnapLine[]) => void;
  stageWidth: number;
  stageHeight: number;
  snapTargets: SnapTarget[];
}

export const GenericCanvasElement = memo(function GenericCanvasElement<
  TState extends Record<string, unknown> = Record<string, unknown>,
>({
  config,
  state,
  layout,
  selectedElement,
  onSelect,
  onTextChange,
  onFontSizeChange,
  onPositionChange,
  onImageDragEnd,
  onImageTransformEnd,
  onSnapChange,
  onSnapLinesChange,
  stageWidth,
  stageHeight,
  snapTargets,
}: GenericCanvasElementProps<TState>) {
  // Check visibility
  if (config.visible && !config.visible(state)) {
    return null;
  }

  const selected = selectedElement === config.id;

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
          onSnapChange={onSnapChange}
          onSnapLinesChange={onSnapLinesChange}
          stageWidth={stageWidth}
          stageHeight={stageHeight}
          snapTargets={snapTargets}
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
          stageWidth={stageWidth}
          stageHeight={stageHeight}
          onSnapChange={onSnapChange}
          onSnapLinesChange={onSnapLinesChange}
          snapTargets={snapTargets}
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
              selectedElement={selectedElement}
              onSelect={onSelect}
              onTextChange={onTextChange}
              onFontSizeChange={onFontSizeChange}
              onPositionChange={onPositionChange}
              onImageDragEnd={onImageDragEnd}
              onImageTransformEnd={onImageTransformEnd}
              onSnapChange={onSnapChange}
              onSnapLinesChange={onSnapLinesChange}
              stageWidth={stageWidth}
              stageHeight={stageHeight}
              snapTargets={snapTargets}
            />
          ))}
        </Group>
      );

    default:
      // Exhaustive check - this should never happen with proper typing
      const exhaustiveCheck: never = config;
      console.warn(
        `Unknown element type: ${(exhaustiveCheck as unknown as CanvasElementConfig).type}`
      );
      return null;
  }
});

export default GenericCanvasElement;
