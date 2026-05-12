import { fromLayout } from './layoutAccessors';

import type { FillValue, LayoutResult, PositionValue, TextElementConfig } from '../types';

/**
 * Shared shape for the primary/secondary text-element factories.
 *
 * Encodes what every factory-template text element looks like: layout-driven
 * x/y/fontSize, static width/font, the standard Grünerator defaults
 * (`align: 'left'`, `wrap: 'word'`, `padding: 0`, `editable: true`,
 * `draggable: true`), and a `fillFallback` hook for templates that read a
 * theme colour from `layout._meta.fontColor` (zitat-pure, info).
 */
interface TextElementOptions<TState> {
  /** Element id, also used for layout lookup. */
  id: string;
  /** State key that holds this element's text. */
  textKey: string;
  /** Z-index. */
  order: number;
  /** Static width. */
  width: PositionValue<TState>;
  /** Font family (helper appends ', Arial, sans-serif'). */
  fontFamily: string;
  fontStyle?: 'bold' | 'normal' | 'italic' | 'bold italic';
  lineHeight?: number;
  /** Hard-coded fallback colour when neither state nor `fillFallback` resolves. */
  defaultColor: string;
  /**
   * Optional secondary fill source — used when the per-element state colour
   * (`primaryColor`/`secondaryColor`) is unset. zitat-pure / info pull from
   * `layout._meta.fontColor`; zitat / simple omit this and rely on `defaultColor`.
   */
  fillFallback?: (state: TState, layout: LayoutResult) => string | undefined;
  /** Layout fallbacks for x/y/fontSize (used when layout doesn't resolve). */
  layoutFallback: {
    x: number;
    y: number;
    fontSize: number;
  };
  align?: 'left' | 'center' | 'right';
}

const PRIMARY_FONT_SIZE_KEY = 'customPrimaryFontSize';
const PRIMARY_OPACITY_KEY = 'primaryOpacity';
const PRIMARY_COLOR_KEY = 'primaryColor';
const SECONDARY_FONT_SIZE_KEY = 'customSecondaryFontSize';
const SECONDARY_OPACITY_KEY = 'secondaryOpacity';
const SECONDARY_COLOR_KEY = 'secondaryColor';

function buildFill<TState>(
  colorKey: 'primaryColor' | 'secondaryColor',
  defaultColor: string,
  fillFallback?: (state: TState, layout: LayoutResult) => string | undefined
): FillValue<TState> {
  return (state, layout) => {
    const stateColor = (state as Record<string, unknown>)[colorKey];
    if (typeof stateColor === 'string') return stateColor;
    if (fillFallback) {
      const fallbackColor = fillFallback(state, layout);
      if (typeof fallbackColor === 'string') return fallbackColor;
    }
    return defaultColor;
  };
}

function buildBaseElement<TState>(
  options: TextElementOptions<TState>,
  fontSizeStateKey: string,
  opacityStateKey: string,
  fillStateKey: string,
  fill: FillValue<TState>
): TextElementConfig<TState> {
  return {
    id: options.id,
    type: 'text',
    x: fromLayout<TState>(options.id, 'x', options.layoutFallback.x),
    y: fromLayout<TState>(options.id, 'y', options.layoutFallback.y),
    order: options.order,
    textKey: options.textKey,
    width: options.width,
    fontSize: fromLayout<TState>(options.id, 'fontSize', options.layoutFallback.fontSize),
    fontFamily: `${options.fontFamily}, Arial, sans-serif`,
    fontStyle: options.fontStyle,
    align: options.align ?? 'left',
    lineHeight: options.lineHeight,
    wrap: 'word',
    padding: 0,
    editable: true,
    draggable: true,
    fontSizeStateKey,
    opacityStateKey,
    fill,
    fillStateKey,
  };
}

/**
 * Builds the primary (headline / quote / header) text element with the
 * canonical state-key wiring: customPrimaryFontSize / primaryOpacity / primaryColor.
 */
export function createPrimaryText<TState>(
  options: TextElementOptions<TState>
): TextElementConfig<TState> {
  return buildBaseElement(
    options,
    PRIMARY_FONT_SIZE_KEY,
    PRIMARY_OPACITY_KEY,
    PRIMARY_COLOR_KEY,
    buildFill<TState>(PRIMARY_COLOR_KEY, options.defaultColor, options.fillFallback)
  );
}

/**
 * Builds the secondary (subtext / name / body) text element with the
 * canonical state-key wiring: customSecondaryFontSize / secondaryOpacity / secondaryColor.
 */
export function createSecondaryText<TState>(
  options: TextElementOptions<TState>
): TextElementConfig<TState> {
  return buildBaseElement(
    options,
    SECONDARY_FONT_SIZE_KEY,
    SECONDARY_OPACITY_KEY,
    SECONDARY_COLOR_KEY,
    buildFill<TState>(SECONDARY_COLOR_KEY, options.defaultColor, options.fillFallback)
  );
}
