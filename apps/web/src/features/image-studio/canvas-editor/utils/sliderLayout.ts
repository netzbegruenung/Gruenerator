/**
 * Slider Layout Utility
 *
 * Layout configuration for the Slider template:
 * - Pill badge header (editable label)
 * - Large headline text
 * - Supporting subtext
 * - Arrow decoration (bottom-right)
 *
 * Supports two color schemes: sand-tanne (default) and tanne-sand
 */

import { SYSTEM_ASSETS } from './canvasAssets';
import { wrapText } from './textUtils';

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
    fontStyle: 'italic' as const,
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
    fontStyle: 'bold italic' as const,
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

export type SliderColorScheme = keyof typeof SLIDER_CONFIG.colorSchemes;

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
 */
function calculateAdaptiveFontSize(
  text: string,
  baseFontSize: number,
  minFontSize: number,
  maxFontSize: number,
  maxWidth: number,
  maxLines: number = 10
): { fontSize: number; lines: string[] } {
  // Try with base font size first
  let fontSize = baseFontSize;
  let lines = wrapText(text, maxWidth, fontSize);

  // If too many lines, reduce font size
  while (lines.length > maxLines && fontSize > minFontSize) {
    fontSize -= 5;
    lines = wrapText(text, maxWidth, fontSize);
  }

  // If few lines, try increasing font size
  if (lines.length <= 3 && fontSize < maxFontSize) {
    const largerFontSize = Math.min(fontSize * 1.2, maxFontSize);
    const largerLines = wrapText(text, maxWidth, largerFontSize);
    if (largerLines.length <= 4) {
      fontSize = largerFontSize;
      lines = largerLines;
    }
  }

  return { fontSize, lines };
}

/**
 * Calculate pill badge dimensions based on label text
 */
function calculatePillDimensions(
  labelText: string,
  customFontSize?: number | null
): { width: number; height: number; fontSize: number } {
  const config = SLIDER_CONFIG.pill;
  const fontSize = customFontSize ?? config.fontSize;

  // Estimate text width (approximate character width ratio for GrueneTypeNeue italic)
  const charWidthRatio = 0.55;
  const textWidth = labelText.length * fontSize * charWidthRatio;
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
  isLastSlide: boolean = false
): SliderLayoutResult {
  const config = SLIDER_CONFIG;

  // Calculate pill dimensions
  const pillDims = calculatePillDimensions(labelText, customLabelFontSize);
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
    6
  );

  // Calculate headline height
  const headlineLineHeight = headlineFontSize * config.headline.lineHeight;
  const headlineHeight = headlineLines.length * headlineLineHeight;

  // Calculate subtext font size
  const { fontSize: subtextFontSize, lines: subtextLines } = calculateAdaptiveFontSize(
    subtextText,
    customSubtextFontSize ?? stBase.fontSize,
    stBase.minFontSize,
    customSubtextFontSize ?? stBase.maxFontSize,
    config.subtext.maxWidth,
    8
  );

  // Calculate subtext height for vertical centering
  const subtextLineHeight = subtextFontSize * config.subtext.lineHeight;
  const subtextHeight = subtextLines.length * subtextLineHeight;

  // For last slide, vertically center the text block
  let subtextY: number;
  if (isLastSlide) {
    const gap = stBase.gapFromHeadline;
    const totalTextHeight = headlineHeight + (subtextText ? gap + subtextHeight : 0);
    const usable = config.canvas.height - config.layout.topMargin - config.layout.bottomMargin;
    const startY = config.layout.topMargin + (usable - totalTextHeight) / 2;
    headlineY = startY;
    subtextY = headlineY + headlineHeight + gap;
  } else {
    subtextY = headlineY + headlineHeight + stBase.gapFromHeadline;
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
    arrow: {
      x: config.arrow.defaultX,
      y: config.arrow.defaultY,
    },
  };
}

/**
 * Get colors for a given color scheme
 */
export function getSliderColors(scheme: SliderColorScheme) {
  return SLIDER_CONFIG.colorSchemes[scheme];
}
