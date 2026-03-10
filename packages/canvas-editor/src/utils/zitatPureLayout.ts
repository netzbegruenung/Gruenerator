/**
 * Zitat-Pure Layout Utility
 * Exact values extracted from apps/api/routes/sharepic/sharepic_canvas/zitat_pure_canvas.ts
 * to ensure 1:1 visual match between frontend and backend rendering
 */
import { SYSTEM_ASSETS } from './canvasAssets';
import { wrapText } from './textUtils';

export const ZITAT_PURE_CONFIG = {
  canvas: {
    width: 1080,
    height: 1350,
  },
  background: {
    color: '#6CCD87',
  },
  quotationMark: {
    src: SYSTEM_ASSETS.quote.default.src,
    size: 100,
    x: 75,
    gapToText: 20,
  },
  quote: {
    fontFamily: 'GrueneTypeNeue',
    fontStyle: 'normal' as const,
    fontSize: 81,
    minFontSize: 50,
    maxFontSize: 90,
    color: '#005437',
    x: 75,
    maxWidth: 930,
    lineHeight: 1.2,
    textAlign: 'left' as const,
  },
  author: {
    fontFamily: 'GrueneTypeNeue',
    fontStyle: 'normal' as const,
    fontSize: 35,
    minFontSize: 25,
    maxFontSize: 50,
    color: '#005437',
    x: 75,
    gapFromQuote: 60,
    textAlign: 'left' as const,
  },
  sunflower: {
    src: SYSTEM_ASSETS.sunflower.green.src,
    size: 800,
    x: 480,
    y: -200,
    opacity: 0.06,
  },
  layout: {
    margin: 75,
    topBoundary: 120,
    bottomBoundary: 1250,
    availableHeight: 1130,
  },
  dynamicScaling: {
    lineThreshold: 5,
    scaleFactor: 1.2,
    maxQuoteFont: 97,
    maxAuthorFont: 42,
  },
} as const;

export interface LayoutResult {
  quoteFontSize: number;
  authorFontSize: number;
  quoteMarkY: number;
  quoteY: number;
  authorY: number;
  quoteLines: string[];
}

export function calculateDynamicFontSize(
  text: string,
  baseFontSize: number,
  minFontSize: number,
  maxFontSize: number,
  maxWidth: number,
  lineThreshold: number,
  scaleFactor: number
): { fontSize: number; lines: string[] } {
  const lines = wrapText(text, maxWidth, baseFontSize);

  if (lines.length <= lineThreshold) {
    const scaledFont = Math.min(baseFontSize * scaleFactor, maxFontSize);
    const scaledLines = wrapText(text, maxWidth, scaledFont);
    return { fontSize: scaledFont, lines: scaledLines };
  }

  return { fontSize: baseFontSize, lines };
}

export function calculateVerticalLayout(
  quoteText: string,
  quoteFontSize: number,
  authorFontSize: number
): LayoutResult {
  const config = ZITAT_PURE_CONFIG;

  const quoteLines = wrapText(quoteText, config.quote.maxWidth, quoteFontSize);
  const quoteLineHeight = quoteFontSize * config.quote.lineHeight;
  const quoteTextHeight = quoteLines.length * quoteLineHeight;

  const totalContentHeight =
    config.quotationMark.size +
    config.quotationMark.gapToText +
    quoteTextHeight +
    config.author.gapFromQuote +
    authorFontSize;

  const verticalOffset =
    config.layout.topBoundary + (config.layout.availableHeight - totalContentHeight) / 2;

  const quoteMarkY = Math.max(config.layout.topBoundary, verticalOffset);
  const quoteY = quoteMarkY + config.quotationMark.size + config.quotationMark.gapToText;
  const authorY = quoteY + quoteTextHeight + config.author.gapFromQuote;

  return {
    quoteFontSize,
    authorFontSize,
    quoteMarkY,
    quoteY,
    authorY,
    quoteLines,
  };
}

export function calculateZitatPureLayout(quoteText: string): LayoutResult {
  const config = ZITAT_PURE_CONFIG;

  const { fontSize: quoteFontSize, lines: quoteLines } = calculateDynamicFontSize(
    quoteText,
    config.quote.fontSize,
    config.quote.minFontSize,
    config.dynamicScaling.maxQuoteFont,
    config.quote.maxWidth,
    config.dynamicScaling.lineThreshold,
    config.dynamicScaling.scaleFactor
  );

  const authorFontSize =
    quoteLines.length <= config.dynamicScaling.lineThreshold
      ? Math.min(
          config.author.fontSize * config.dynamicScaling.scaleFactor,
          config.dynamicScaling.maxAuthorFont
        )
      : config.author.fontSize;

  return calculateVerticalLayout(quoteText, quoteFontSize, authorFontSize);
}
