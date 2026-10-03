/**
 * Slider Layout Utility
 *
 * Layout configuration for the Slider template:
 * - Pill badge header (editable label)
 * - Large headline text
 * - Supporting subtext
 * - Arrow decoration (bottom-right)
 *
 * Supports two color schemes: sand-tanne (default) and tanne-sand. The
 * Austrian deck (`slider-at`) runs the same geometry with its own colours and
 * typography, see SLIDER_AT_STYLE.
 */

import { getBrandTheme } from '../brand/theme';

import { SYSTEM_ASSETS } from './canvasAssets';
import { measureTextWidthWithFont, wrapTextAccurate } from './textUtils';

// ============================================================================
// CONFIGURATION CONSTANTS
// ============================================================================

export const SLIDER_CONFIG = {
  canvas: {
    width: 1080,
    height: 1350,
  },

  layout: {
    leftMargin: 80,
    rightMargin: 80,
    topMargin: 120,
    bottomMargin: 100,
    contentWidth: 920, // 1080 - 80 - 80
  },

  // Pill badge configuration
  pill: {
    x: 80,
    y: 120,
    paddingX: 40,
    paddingY: 16,
    cornerRadius: 50,
    fontFamily: 'GrueneTypeNeue',
    fontStyle: 'normal' as const,
    fontSize: 70,
    minFontSize: 60,
    maxFontSize: 80,
    lineHeight: 1.0,
  },

  // Headline configuration
  headline: {
    x: 80,
    gapFromPill: 60,
    maxWidth: 920,
    fontFamily: 'GrueneTypeNeue',
    fontStyle: 'normal' as const,
    fontSize: 90,
    minFontSize: 60,
    maxFontSize: 120,
    lineHeight: 1.2,
  },

  // Subtext configuration
  subtext: {
    x: 80,
    gapFromHeadline: 50,
    maxWidth: 920,
    fontFamily: 'PT Sans',
    fontStyle: 'bold' as const,
    fontSize: 50,
    minFontSize: 35,
    maxFontSize: 70,
    lineHeight: 1.45,
  },

  // Subtext2 configuration (same styling as subtext)
  subtext2: {
    x: 80,
    gapFromSubtext: 50,
    maxWidth: 920,
    fontFamily: 'PT Sans',
    fontStyle: 'bold' as const,
    fontSize: 50,
    minFontSize: 35,
    maxFontSize: 70,
    lineHeight: 1.45,
  },

  // Content slide overrides (slides without pill badge)
  contentSlide: {
    headline: {
      fontSize: 70,
      minFontSize: 50,
      maxFontSize: 80,
    },
    subtext: {
      gapFromHeadline: 40,
      fontSize: 45,
      minFontSize: 32,
      maxFontSize: 55,
    },
    subtext2: {
      gapFromSubtext: 40,
      fontSize: 45,
      minFontSize: 32,
      maxFontSize: 55,
    },
  },

  // Last slide overrides (CTA/closing slide — same font sizes as cover, vertically centered)
  lastSlide: {
    headline: {
      fontSize: 90,
      minFontSize: 60,
      maxFontSize: 120,
    },
    subtext: {
      gapFromHeadline: 50,
      fontSize: 50,
      minFontSize: 35,
      maxFontSize: 70,
    },
  },

  // Arrow configuration
  arrow: {
    defaultX: 940,
    defaultY: 1200,
    scale: 1.4,
  },

  // Sunflower watermark (bottom-left, cover slides only)
  sunflower: {
    src: SYSTEM_ASSETS.sunflower.green.src,
    size: 800,
    x: -200,
    y: 750,
    opacity: 0.06,
  },

  // Color schemes
  colorSchemes: {
    'sand-tanne': {
      background: '#F5F1E9',
      pillBackground: '#005538',
      pillText: '#FFFFFF',
      headlineText: '#005538',
      subtextText: '#005538',
      arrowFill: '#005538',
    },
    'tanne-sand': {
      background: '#005538',
      pillBackground: '#F5F1E9',
      pillText: '#005538',
      headlineText: '#F5F1E9',
      subtextText: '#F5F1E9',
      arrowFill: '#F5F1E9',
    },
  },
} as const;

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface SliderSchemeColors {
  background: string;
  pillBackground: string;
  pillText: string;
  headlineText: string;
  subtextText: string;
  arrowFill: string;
}

interface SliderFont {
  fontFamily: string;
  fontStyle: 'normal' | 'bold';
}

/**
 * What a brand changes on the slider: colours and typography. Geometry, font
 * sizes and the slide variants stay shared in SLIDER_CONFIG.
 */
export interface SliderStyle<S extends string = string> {
  colorSchemes: Record<S, SliderSchemeColors>;
  defaultScheme: S & SliderColorScheme;
  pill: SliderFont;
  headline: SliderFont & { lineHeight: number };
  /** Also used for subtext2. */
  subtext: SliderFont & { lineHeight: number };
}

export const SLIDER_DE_STYLE: SliderStyle<keyof typeof SLIDER_CONFIG.colorSchemes> = {
  colorSchemes: SLIDER_CONFIG.colorSchemes,
  defaultScheme: 'sand-tanne',
  pill: SLIDER_CONFIG.pill,
  headline: SLIDER_CONFIG.headline,
  subtext: SLIDER_CONFIG.subtext,
};

const AT = getBrandTheme('de-AT');

/**
 * Österreich (CI 2026): Dunkelgrün als Hauptfläche, Hellgrün als Alternative,
 * weiße Gotham Narrow mit Zeilenabstand × 0,9. Die Kopf-Pille ist auf
 * Dunkelgrün gelb (die Hervorhebungsfarbe der CI), auf Hellgrün dunkelgrün —
 * Gelb auf Hellgrün trägt nicht.
 */
export const SLIDER_AT_STYLE: SliderStyle<'dunkelgruen' | 'hellgruen'> = {
  colorSchemes: {
    dunkelgruen: {
      background: AT.colors.primary,
      pillBackground: AT.colors.accent,
      pillText: AT.colors.primary,
      headlineText: AT.colors.textOnDark,
      subtextText: AT.colors.textOnDark,
      arrowFill: AT.colors.textOnDark,
    },
    hellgruen: {
      background: AT.colors.secondary,
      pillBackground: AT.colors.primary,
      pillText: AT.colors.textOnDark,
      headlineText: AT.colors.textOnDark,
      subtextText: AT.colors.textOnDark,
      arrowFill: AT.colors.textOnDark,
    },
  },
  defaultScheme: 'dunkelgruen',
  pill: { fontFamily: AT.fonts.headline, fontStyle: 'normal' },
  headline: { fontFamily: AT.fonts.headline, fontStyle: 'normal', lineHeight: AT.lineHeightFactor },
  subtext: { fontFamily: AT.fonts.body, fontStyle: 'normal', lineHeight: 1.3 },
};

/**
 * Weißes Ein-Balken-Logo statt Sonnenblume, rechts oben wie bei Info und Zitat
 * (AT), auf Höhe der Pille. Unterkante 269 bleibt über dem Headline-Start
 * eines Covers (Pille 120 + 102 + Abstand 60 = 282).
 */
const AT_LOGO_WIDTH = 170;
const AT_LOGO_HEIGHT = Math.round(AT_LOGO_WIDTH * (1239 / 1410));
export const SLIDER_AT_LOGO = {
  src: AT.logo?.src ?? SYSTEM_ASSETS.logoAt.weiss.src,
  width: AT_LOGO_WIDTH,
  height: AT_LOGO_HEIGHT,
  x: SLIDER_CONFIG.canvas.width - SLIDER_CONFIG.layout.rightMargin - AT_LOGO_WIDTH,
  y: SLIDER_CONFIG.pill.y,
} as const;

export type SliderColorScheme =
  keyof typeof SLIDER_CONFIG.colorSchemes | keyof typeof SLIDER_AT_STYLE.colorSchemes;

export interface SliderLayoutResult {
  pill: {
    rectX: number;
    rectY: number;
    rectWidth: number;
    rectHeight: number;
    textX: number;
    textY: number;
  };
  headline: {
    x: number;
    y: number;
    fontSize: number;
    lines: string[];
  };
  subtext: {
    x: number;
    y: number;
    fontSize: number;
    lines: string[];
  };
  subtext2: {
    x: number;
    y: number;
    fontSize: number;
    lines: string[];
  };
  arrow: {
    x: number;
    y: number;
  };
}

// ============================================================================
// LAYOUT CALCULATIONS
// ============================================================================

/**
 * Calculate font size for text that needs to fit within bounds
 * Uses accurate font measurement to match Konva's actual rendering
 */
function calculateAdaptiveFontSize(
  text: string,
  baseFontSize: number,
  minFontSize: number,
  maxFontSize: number,
  maxWidth: number,
  fontFamily: string,
  fontStyle: string,
  maxLines: number = 10
): { fontSize: number; lines: string[] } {
  // Try with base font size first
  let fontSize = baseFontSize;
  let lines = wrapTextAccurate(text, maxWidth, fontSize, fontFamily, fontStyle);

  // If too many lines, reduce font size
  while (lines.length > maxLines && fontSize > minFontSize) {
    fontSize -= 5;
    lines = wrapTextAccurate(text, maxWidth, fontSize, fontFamily, fontStyle);
  }

  // If few lines, try increasing font size
  if (lines.length <= 3 && fontSize < maxFontSize) {
    const largerFontSize = Math.min(fontSize * 1.2, maxFontSize);
    const largerLines = wrapTextAccurate(text, maxWidth, largerFontSize, fontFamily, fontStyle);
    if (largerLines.length <= 4) {
      fontSize = largerFontSize;
      lines = largerLines;
    }
  }

  return { fontSize, lines };
}

/**
 * Calculate pill badge dimensions based on label text
 * Uses accurate font measurement for proper sizing
 */
function calculatePillDimensions(
  labelText: string,
  customFontSize: number | null | undefined,
  font: SliderFont
): { width: number; height: number; fontSize: number } {
  const config = SLIDER_CONFIG.pill;
  const fontSize = customFontSize ?? config.fontSize;

  // Use accurate text measurement for pill width
  const textWidth = measureTextWidthWithFont(labelText, fontSize, font.fontFamily, font.fontStyle);
  const width = textWidth + config.paddingX * 2;
  const height = fontSize + config.paddingY * 2;

  return { width, height, fontSize };
}

/**
 * Calculate the complete layout for the slider template
 */
export function calculateSliderLayout(
  labelText: string,
  headlineText: string,
  subtextText: string,
  customLabelFontSize?: number | null,
  customHeadlineFontSize?: number | null,
  customSubtextFontSize?: number | null,
  showPill: boolean = true,
  isLastSlide: boolean = false,
  subtext2Text: string = '',
  customSubtext2FontSize?: number | null,
  style: SliderStyle = SLIDER_DE_STYLE
): SliderLayoutResult {
  const config = SLIDER_CONFIG;

  // Calculate pill dimensions
  const pillDims = calculatePillDimensions(labelText, customLabelFontSize, style.pill);
  const pillY = config.pill.y;
  const pillTextX = config.pill.x + config.pill.paddingX;
  const pillTextY = pillY + config.pill.paddingY;

  // Choose config overrides based on variant
  const hlBase = showPill
    ? config.headline
    : isLastSlide
      ? { ...config.headline, ...config.lastSlide.headline }
      : { ...config.headline, ...config.contentSlide.headline };
  const stBase = showPill
    ? config.subtext
    : isLastSlide
      ? { ...config.subtext, ...config.lastSlide.subtext }
      : { ...config.subtext, ...config.contentSlide.subtext };
  const st2Base = showPill
    ? config.subtext2
    : isLastSlide
      ? config.subtext2
      : { ...config.subtext2, ...config.contentSlide.subtext2 };

  // When no pill, headline starts at top margin (more space for text)
  let headlineY = showPill
    ? pillY + pillDims.height + config.headline.gapFromPill
    : config.layout.topMargin;
  const { fontSize: headlineFontSize, lines: headlineLines } = calculateAdaptiveFontSize(
    headlineText,
    customHeadlineFontSize ?? hlBase.fontSize,
    hlBase.minFontSize,
    customHeadlineFontSize ?? hlBase.maxFontSize,
    config.headline.maxWidth,
    style.headline.fontFamily,
    style.headline.fontStyle,
    6
  );

  // Calculate headline height
  const headlineLineHeight = headlineFontSize * style.headline.lineHeight;
  const headlineHeight = headlineLines.length * headlineLineHeight;

  // Calculate subtext font size
  const { fontSize: subtextFontSize, lines: subtextLines } = calculateAdaptiveFontSize(
    subtextText,
    customSubtextFontSize ?? stBase.fontSize,
    stBase.minFontSize,
    customSubtextFontSize ?? stBase.maxFontSize,
    config.subtext.maxWidth,
    style.subtext.fontFamily,
    style.subtext.fontStyle,
    8
  );

  // Calculate subtext height for vertical centering
  const subtextLineHeight = subtextFontSize * style.subtext.lineHeight;
  const subtextHeight = subtextLines.length * subtextLineHeight;

  // Calculate subtext2 font size and lines (only for content slides)
  const { fontSize: subtext2FontSize, lines: subtext2Lines } = calculateAdaptiveFontSize(
    subtext2Text,
    customSubtext2FontSize ?? st2Base.fontSize,
    st2Base.minFontSize,
    customSubtext2FontSize ?? st2Base.maxFontSize,
    config.subtext2.maxWidth,
    style.subtext.fontFamily,
    style.subtext.fontStyle,
    8
  );

  const subtext2LineHeight = subtext2FontSize * style.subtext.lineHeight;
  const subtext2Height = subtext2Lines.length * subtext2LineHeight;

  // For last slide, vertically center the text block (no subtext2 on last slide)
  let subtextY: number;
  let subtext2Y: number;
  if (isLastSlide) {
    const gap = stBase.gapFromHeadline;
    const totalTextHeight = headlineHeight + (subtextText ? gap + subtextHeight : 0);
    const usable = config.canvas.height - config.layout.topMargin - config.layout.bottomMargin;
    const startY = config.layout.topMargin + (usable - totalTextHeight) / 2;
    headlineY = startY;
    subtextY = headlineY + headlineHeight + gap;
    subtext2Y = subtextY + subtextHeight + st2Base.gapFromSubtext;
  } else {
    subtextY = headlineY + headlineHeight + stBase.gapFromHeadline;
    subtext2Y = subtextY + subtextHeight + st2Base.gapFromSubtext;
  }

  return {
    pill: {
      rectX: config.pill.x,
      rectY: pillY,
      rectWidth: pillDims.width,
      rectHeight: pillDims.height,
      textX: pillTextX,
      textY: pillTextY,
    },
    headline: {
      x: config.headline.x,
      y: headlineY,
      fontSize: headlineFontSize,
      lines: headlineLines,
    },
    subtext: {
      x: config.subtext.x,
      y: subtextY,
      fontSize: subtextFontSize,
      lines: subtextLines,
    },
    subtext2: {
      x: config.subtext2.x,
      y: subtext2Y,
      fontSize: subtext2FontSize,
      lines: subtext2Lines,
    },
    arrow: {
      x: config.arrow.defaultX,
      y: config.arrow.defaultY,
    },
  };
}

export const DEFAULT_SLIDER_COLOR_SCHEME: SliderColorScheme = SLIDER_DE_STYLE.defaultScheme;

/**
 * Narrow an unknown value to a known scheme id.
 *
 * Persisted `initial_state` is not a typed channel: the studio store carries a
 * `colorScheme` of an entirely different shape (a `{background}[]` palette for
 * the legacy sharepic generator), and older documents may carry ids we no
 * longer ship. Both are truthy, so a `?? 'sand-tanne'` default does NOT catch
 * them — only membership does.
 */
export function isSliderColorScheme(
  value: unknown,
  style: SliderStyle = SLIDER_DE_STYLE
): value is SliderColorScheme {
  // `hasOwn`, not `in`: `'toString' in colorSchemes` is true via the prototype
  // chain and would resolve to a function, whose `.arrowFill` is undefined —
  // the same silent-undefined footgun one level down.
  return typeof value === 'string' && Object.hasOwn(style.colorSchemes, value);
}

/**
 * Get colors for a given color scheme.
 *
 * Total by construction: an unknown scheme falls back to the default instead of
 * returning `undefined`. Every call site reads a field straight off the result
 * (`.arrowFill`, `.headlineText`, …), so a partial lookup here surfaces as a
 * `Cannot read properties of undefined` at the *caller* — which is how a
 * palette-shaped `colorScheme` in a minted canvas took down the whole slider
 * render instead of just picking the wrong colours.
 */
export function getSliderColors(
  scheme: SliderColorScheme,
  style: SliderStyle = SLIDER_DE_STYLE
): SliderSchemeColors {
  return style.colorSchemes[isSliderColorScheme(scheme, style) ? scheme : style.defaultScheme];
}

/**
 * Slider colours when a background photo covers the plane.
 *
 * The rule matches every sibling photo template: white text plus a contrast
 * scrim — an arbitrary photograph has no predictable luminance, so the derived
 * scheme text colours would land unreadable about half the time. The pill keeps
 * its state-driven colour: a filled chip over an image is legible whether it
 * picks the tanne or the sand variant, and a per-slide pill colour the user
 * picked stays theirs. The arrow follows the text (white), matching the sibling
 * "force white" rule — the scrim darkens the bottom of the frame so a light
 * arrow reads there.
 */
export const SLIDER_PHOTO_OVERLAY = {
  headlineText: '#FFFFFF',
  subtextText: '#FFFFFF',
  arrowFill: '#FFFFFF',
} as const;

export interface SliderStateLike {
  colorScheme: SliderColorScheme;
  currentImageSrc?: string | null;
}

/**
 * Scheme colours, overridden by the photo overlay while a background picture
 * covers the plane. Same total-by-construction contract as `getSliderColors`:
 * callers read fields straight off the result.
 */
export function getSliderColorsForState(
  state: SliderStateLike,
  style: SliderStyle = SLIDER_DE_STYLE
): SliderSchemeColors {
  const base = getSliderColors(state.colorScheme, style);
  if (!state.currentImageSrc) return base;
  return { ...base, ...SLIDER_PHOTO_OVERLAY };
}
