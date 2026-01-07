/**
 * Simple Canvas Layout Configuration
 * "Text auf Bild" - Simple headline + subtext on background image
 * 1:1 match with backend simple_canvas.ts
 */

export interface SimpleConfig {
  canvas: {
    width: number;
    height: number;
  };
  headline: {
    x: number;
    y: number;
    maxWidth: number;
    fontSize: number;
    fontFamily: string;
    fontStyle: 'bold' | 'normal' | 'italic' | 'bold italic';
    color: string;
    lineHeightRatio: number;
  };
  subtext: {
    x: number;
    gap: number;
    maxWidth: number;
    fontSize: number;
    fontFamily: string;
    fontStyle: 'bold' | 'normal' | 'italic' | 'bold italic';
    color: string;
    lineHeightRatio: number;
  };
  gradient: {
    topOpacity: number;
    bottomOpacity: number;
  };
}

export const SIMPLE_CONFIG: SimpleConfig = {
  canvas: {
    width: 1080,
    height: 1350,
  },
  headline: {
    x: 50,
    y: 80,
    maxWidth: 980,
    fontSize: 80,
    fontFamily: 'GrueneTypeNeue',
    fontStyle: 'bold',
    color: '#FFFFFF',
    lineHeightRatio: 1.1,
  },
  subtext: {
    x: 50,
    gap: 15,
    maxWidth: 980,
    fontSize: 50,
    fontFamily: 'GrueneTypeNeue',
    fontStyle: 'normal',
    color: '#FFD43B', // Sonne
    lineHeightRatio: 1.2,
  },
  gradient: {
    topOpacity: 0.1,
    bottomOpacity: 0.4,
  },
};

export interface SimpleLayout {
  headlineY: number;
  headlineFontSize: number;
  headlineHeight: number;
  subtextY: number;
  subtextFontSize: number;
  subtextHeight: number;
}

/**
 * Estimate text height based on content, width, and font size
 */
function estimateTextHeight(
  text: string,
  fontSize: number,
  maxWidth: number,
  lineHeightRatio: number
): number {
  const avgCharWidth = fontSize * 0.55;
  const charsPerLine = Math.floor(maxWidth / avgCharWidth);
  const lineCount = Math.max(1, Math.ceil(text.length / charsPerLine));
  return lineCount * fontSize * lineHeightRatio;
}

/**
 * Calculate layout for Simple canvas
 */
export function calculateSimpleLayout(
  headline: string,
  subtext: string,
  headlineFontSize?: number,
  subtextFontSize?: number
): SimpleLayout {
  const config = SIMPLE_CONFIG;

  const finalHeadlineFontSize = headlineFontSize ?? config.headline.fontSize;
  const finalSubtextFontSize = subtextFontSize ?? config.subtext.fontSize;

  const headlineHeight = estimateTextHeight(
    headline,
    finalHeadlineFontSize,
    config.headline.maxWidth,
    config.headline.lineHeightRatio
  );

  const subtextHeight = estimateTextHeight(
    subtext,
    finalSubtextFontSize,
    config.subtext.maxWidth,
    config.subtext.lineHeightRatio
  );

  const headlineY = config.headline.y;
  const subtextY = headlineY + headlineHeight + config.subtext.gap;

  return {
    headlineY,
    headlineFontSize: finalHeadlineFontSize,
    headlineHeight,
    subtextY,
    subtextFontSize: finalSubtextFontSize,
    subtextHeight,
  };
}

export default {
  SIMPLE_CONFIG,
  calculateSimpleLayout,
};
