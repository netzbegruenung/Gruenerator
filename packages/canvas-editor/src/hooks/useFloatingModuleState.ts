import { templateTextAlignOf, type TextAlign } from '@ggraphic/editor/utils/textAlign';
import { useMemo, useRef } from 'react';

import { canCropBackgroundPhoto } from '../utils/backgroundPhotoCrop';
import { resolveValue } from '../utils/canvasValueResolver';
import { findKindItem, type ElementKindName, type KindItem } from '../utils/elementKinds';

import type { StockImageAttribution } from '../common/imageSourceTypes';
import type { FullCanvasConfig, LayoutResult } from '../configs/types';
import type { GradientFill } from '@ggraphic/editor/utils/gradientFill';

/**
 * Floating Module State - Determines active floating toolbar module
 *
 * Based on the selected element, computes which floating toolbar controls
 * should be shown (text, image, shape, icon, illustration, asset) and their current values.
 */

export interface FloatingModuleState {
  type:
    | 'text'
    | 'image'
    | 'shape'
    | 'icon'
    | 'illustration'
    | 'asset'
    | 'background'
    | 'balken'
    | 'frame'
    | 'user-image'
    | 'chart'
    | 'pill-badge'
    | 'circle-badge';
  data: {
    id: string;
    fontSize?: number;
    opacity?: number;
    fill?: string;
    color?: string;
    // Effect controls (outline / shadow / blur / gradient)
    stroke?: string;
    strokeWidth?: number;
    shadowColor?: string;
    shadowBlur?: number;
    shadowOffsetX?: number;
    shadowOffsetY?: number;
    shadowOpacity?: number;
    blur?: number;
    fillGradient?: GradientFill | null;
    /** Ausrichtung des Textes in seiner Box (beide Textarten). */
    align?: TextAlign;
    /**
     * True only for instance-backed text (additionalTexts), which stores effect
     * fields directly. Config-declared template texts route through state keys
     * and don't support outline/shadow/gradient, so their controls are hidden.
     */
    isInstanceText?: boolean;
    /** Das Foto lässt im Ausschnitt-Modus Ziehen oder Zoomen zu. */
    canCrop?: boolean;
    /** Stock credit of a placed (hotlinked) Unsplash photo. */
    attribution?: StockImageAttribution;
    [key: string]: unknown;
  };
}

export interface UseFloatingModuleStateOptions<
  TState extends Record<string, unknown>,
  TActions = Record<string, unknown>,
> {
  selectedElement: string | null;
  config: FullCanvasConfig<TState, TActions>;
  state: TState;
  layout: LayoutResult;
}

/**
 * Helper to safely access state property with type narrowing
 */
function getStateProperty<T>(state: unknown, key: string | undefined): T | undefined {
  if (!key) return undefined;
  const stateObj = state as Record<string, unknown>;
  return stateObj[key] as T | undefined;
}

/**
 * Opacity shown in the floating toolbar for a config-declared element.
 *
 * State key first, the element's own `opacity` as fallback — the same
 * precedence `GenericCanvasElement` renders with (`customOpacity ??
 * config.opacity`). Reading the key exclusively made the slider report 100%
 * for elements that carry both until the key was first written, so grabbing
 * it jumped zitat-pure's 6% sunflower to full opacity.
 */
export function resolveToolbarOpacity<TState extends Record<string, unknown>>(
  element: { opacity?: unknown; opacityStateKey?: string },
  state: TState,
  layout: LayoutResult
): number | undefined {
  const fromState = getStateProperty<number>(state, element.opacityStateKey);
  if (fromState !== undefined && fromState !== null) return fromState;
  if (element.opacity === undefined) return undefined;
  return resolveValue<number | undefined, TState>(
    element.opacity as number | ((state: TState, layout: LayoutResult) => number | undefined),
    state,
    layout
  );
}

/**
 * Hook to compute active floating module based on selected element
 */
function floatingModuleEqual(
  a: FloatingModuleState | null,
  b: FloatingModuleState | null
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.type === b.type &&
    a.data.id === b.data.id &&
    a.data.fontSize === b.data.fontSize &&
    a.data.opacity === b.data.opacity &&
    a.data.fill === b.data.fill &&
    a.data.color === b.data.color &&
    a.data.stroke === b.data.stroke &&
    a.data.strokeWidth === b.data.strokeWidth &&
    a.data.shadowColor === b.data.shadowColor &&
    a.data.shadowBlur === b.data.shadowBlur &&
    a.data.shadowOffsetX === b.data.shadowOffsetX &&
    a.data.shadowOffsetY === b.data.shadowOffsetY &&
    a.data.shadowOpacity === b.data.shadowOpacity &&
    a.data.blur === b.data.blur &&
    a.data.fillGradient === b.data.fillGradient &&
    a.data.align === b.data.align
  );
}

type KindModules = {
  [K in ElementKindName]: (
    item: Extract<KindItem, { type: K }>,
    state: Record<string, unknown>
  ) => FloatingModuleState;
};

/**
 * The floating module per element kind. Most kinds hand their whole instance
 * to the module; the exceptions say why they don't.
 */
const KIND_MODULES: KindModules = {
  shape: ({ id, data }) => ({ type: 'shape', data: { ...data, id } }),
  // Icons are listed as bare ids; their state lives under the id in `iconStates`.
  icon: ({ id }, state) => {
    const iconStates = getStateProperty<Record<string, unknown>>(state, 'iconStates');
    return { type: 'icon', data: { id, ...(iconStates?.[id] ?? {}) } };
  },
  // Instance-backed text shares the template text's module, flagged so the
  // effect controls (outline, shadow, gradient) show.
  'additional-text': ({ id, data: t }) => ({
    type: 'text',
    data: {
      id,
      isInstanceText: true,
      fontSize: t.fontSize,
      opacity: t.opacity ?? 1,
      fill: t.fill,
      stroke: t.stroke,
      strokeWidth: t.strokeWidth,
      shadowColor: t.shadowColor,
      shadowBlur: t.shadowBlur,
      shadowOffsetX: t.shadowOffsetX,
      shadowOffsetY: t.shadowOffsetY,
      shadowOpacity: t.shadowOpacity,
      fillGradient: t.fillGradient,
      align: t.align ?? 'left',
    },
  }),
  balken: ({ id, data }) => ({ type: 'balken', data: { id, opacity: data.opacity ?? 1 } }),
  illustration: ({ id, data }) => ({ type: 'illustration', data: { ...data, id } }),
  frame: ({ id, data }) => ({ type: 'frame', data: { ...data, id } }),
  asset: ({ id, data }) => ({ type: 'asset', data: { ...data, id } }),
  'user-image': ({ id, data }) => ({
    type: 'user-image',
    data: { ...data, id, opacity: data.opacity ?? 1 },
  }),
  // Badges: the swatch colours the badge body (`backgroundColor`), not its text.
  'pill-badge': ({ id, data }) => ({
    type: 'pill-badge',
    data: { id, fill: data.backgroundColor, opacity: data.opacity ?? 1 },
  }),
  'circle-badge': ({ id, data }) => ({
    type: 'circle-badge',
    data: { id, fill: data.backgroundColor, opacity: data.opacity ?? 1 },
  }),
  // Charts: series colours live in the chart-settings tab; the bar only
  // carries opacity.
  chart: ({ id, data }) => ({ type: 'chart', data: { id, opacity: data.opacity ?? 1 } }),
};

type KindModule = (item: KindItem, state: Record<string, unknown>) => FloatingModuleState;

function kindModule(item: KindItem, state: Record<string, unknown>): FloatingModuleState {
  // Boundary: `item.type` picks the entry that takes exactly this item.
  return (KIND_MODULES[item.type] as KindModule)(item, state);
}

/**
 * Die Leisten-Daten zu einem Element, ohne Hook — das Kontextmenü fragt sie
 * beim Öffnen ab, bevor die Leiste die neue Auswahl gemeldet hat.
 */
export function floatingModuleFor<
  TState extends Record<string, unknown>,
  TActions = Record<string, unknown>,
>(
  selectedElement: string | null,
  config: FullCanvasConfig<TState, TActions>,
  state: TState,
  layout: LayoutResult
): FloatingModuleState | null {
  if (!selectedElement) return null;

  // Check if Text element (from config)
  const textElement = config.elements.find((e) => e.id === selectedElement && e.type === 'text');
  if (textElement && textElement.type === 'text') {
    const fontSizeStateKey = textElement.fontSizeStateKey as string | undefined;
    const fillStateKey = textElement.fillStateKey as string | undefined;

    const currentFontSize =
      getStateProperty<number>(state, fontSizeStateKey) ||
      resolveValue<number, TState>(
        textElement.fontSize as number | ((state: TState, layout: LayoutResult) => number),
        state,
        layout
      ) ||
      24;
    const currentOpacity = resolveToolbarOpacity(textElement, state, layout);
    const currentFill = fillStateKey
      ? getStateProperty<string>(state, fillStateKey)
      : textElement.fill !== undefined
        ? resolveValue<string | undefined, TState>(
            textElement.fill as
              string | ((state: TState, layout: LayoutResult) => string | undefined),
            state,
            layout
          )
        : undefined;

    return {
      type: 'text' as const,
      data: {
        id: selectedElement,
        fontSize: currentFontSize,
        opacity: typeof currentOpacity === 'number' ? currentOpacity : 1,
        fill: typeof currentFill === 'string' ? currentFill : '#000000',
        align: templateTextAlignOf(state, selectedElement) ?? textElement.align ?? 'left',
      },
    };
  }

  // Check if Image element (from config)
  const imageElement = config.elements.find((e) => e.id === selectedElement && e.type === 'image');
  if (imageElement && imageElement.type === 'image') {
    const fillStateKey = imageElement.fillStateKey as string | undefined;

    const currentOpacity = resolveToolbarOpacity(imageElement, state, layout);
    // Get fill from state or resolve from config
    let currentFill: string | undefined = undefined;
    if (fillStateKey) {
      currentFill = getStateProperty<string>(state, fillStateKey);
    } else if (imageElement.fill) {
      currentFill = resolveValue<string, TState>(
        imageElement.fill as string | ((state: TState, layout: LayoutResult) => string),
        state,
        layout
      );
    }

    return {
      type: 'image' as const,
      data: {
        id: selectedElement,
        opacity: typeof currentOpacity === 'number' ? currentOpacity : 1,
        fill: typeof currentFill === 'string' && currentFill ? currentFill : undefined,
        // Das austauschbare Foto der Vorlage — nicht Deko mit festem `src`
        // und nicht der Profilbild-Avatar (`transparentImage`).
        isPhoto: imageElement.srcKey === 'currentImageSrc',
        canCrop: canCropBackgroundPhoto(imageElement),
      },
    };
  }

  // Check if Background element (from config)
  const backgroundElement = config.elements.find(
    (e) => e.id === selectedElement && e.type === 'background'
  );
  if (backgroundElement && backgroundElement.type === 'background') {
    const fillStateKey = backgroundElement.fillStateKey as string | undefined;

    const currentOpacity = resolveToolbarOpacity(backgroundElement, state, layout);

    let currentFill: string | undefined = undefined;
    if (fillStateKey) {
      currentFill = getStateProperty<string>(state, fillStateKey);
    } else if (backgroundElement.fill) {
      currentFill = resolveValue<string, TState>(
        backgroundElement.fill as string | ((state: TState, layout: LayoutResult) => string),
        state,
        layout
      );
    }
    if (!currentFill) {
      const colorKey = (backgroundElement as { colorKey?: string }).colorKey;
      if (colorKey) {
        currentFill = getStateProperty<string>(state, colorKey);
      }
    }

    return {
      type: 'background' as const,
      data: {
        id: selectedElement,
        opacity: typeof currentOpacity === 'number' ? currentOpacity : 1,
        fill: typeof currentFill === 'string' && currentFill ? currentFill : undefined,
      },
    };
  }

  const found = findKindItem(state, selectedElement);
  return found ? kindModule(found, state) : null;
}

export function useFloatingModuleState<
  TState extends Record<string, unknown>,
  TActions = Record<string, unknown>,
>(options: UseFloatingModuleStateOptions<TState, TActions>): FloatingModuleState | null {
  const { selectedElement, config, state, layout } = options;
  const prevRef = useRef<FloatingModuleState | null>(null);

  const computed = useMemo(
    () => floatingModuleFor(selectedElement, config, state, layout),
    [selectedElement, config, state, layout]
  );

  // Return stable reference when derived values haven't changed
  if (floatingModuleEqual(prevRef.current, computed)) {
    return prevRef.current;
  }
  prevRef.current = computed;
  return computed;
}
