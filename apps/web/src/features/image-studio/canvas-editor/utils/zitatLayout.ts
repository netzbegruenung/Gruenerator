/**
 * Zitat Layout Utility
 * Exact values extracted from apps/api/routes/sharepic/sharepic_canvas/zitat_canvas.ts
 * to ensure 1:1 visual match between frontend and backend rendering
 *
 * Zitat differs from ZitatPure:
 * - Uses user-provided background image (not solid color)
 * - Has gradient overlay for text contrast
 * - Text is white (not dark green)
 * - Quote mark is white
 */

export const ZITAT_CONFIG = {
  canvas: {
    width: 1080,
    height: 1350,
  },
  gradient: {
    enabled: true,
    topOpacity: 0,
    bottomOpacity: 0.5,
  },
  quotationMark: {
    src: '/quote-white.svg',
    x: 50,
    y: 750, // Fixed Y position from backend
    sizeRatio: 1.67, // quoteMarkSize = fontSize * 1.67
    gapToText: 10,
  },
  quote: {
    fontFamily: 'GrueneTypeNeue',
    fontStyle: 'italic' as const,
    fontSize: 60,
    minFontSize: 45,
    maxFontSize: 80,
    color: '#ffffff',
    x: 50,
    maxWidth: 980,
    lineHeightRatio: 1.17,
    textAlign: 'left' as const,
  },
  author: {
    fontFamily: 'GrueneTypeNeue',
    fontStyle: 'italic' as const,
    fontSizeRatio: 0.67, // nameFontSize = fontSize * 0.67
    color: '#ffffff',
    x: 50,
    gapFromQuoteRatio: 1.33, // nameOffset = fontSize * 1.33
    textAlign: 'left' as const,
  },
  layout: {
    margin: 50,
  },
} as const;

export interface ZitatLayoutResult {
  quoteFontSize: number;
  authorFontSize: number;
  quoteMarkY: number;
  quoteMarkSize: number;
  quoteY: number;
  authorY: number;
  lineHeight: number;
  nameOffset: number;
  quoteLines: string[];
}

/**
 * Wrap text into lines based on character width estimation
 * Matches backend logic in zitat_canvas.ts
 */
export function wrapText(
  text: string,
  maxWidth: number,
  fontSize: number,
  charWidthRatio = 0.5
): string[] {
  const charWidth = fontSize * charWidthRatio;
  const maxCharsPerLine = Math.floor(maxWidth / charWidth);
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (testLine.length <= maxCharsPerLine) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);

  return lines;
}

/**
 * Calculate layout for Zitat canvas
 * Matches exact calculations from zitat_canvas.ts:86-101
 */
export function calculateZitatLayout(
  quoteText: string,
  fontSize: number = ZITAT_CONFIG.quote.fontSize
): ZitatLayoutResult {
  const config = ZITAT_CONFIG;

  // Clamp font size to valid range
  const clampedFontSize = Math.max(
    config.quote.minFontSize,
    Math.min(config.quote.maxFontSize, fontSize)
  );

  // Calculate derived values (matching backend)
  const lineHeight = Math.round(clampedFontSize * config.quote.lineHeightRatio);
  const authorFontSize = Math.round(clampedFontSize * config.author.fontSizeRatio);
  const quoteMarkSize = Math.round(clampedFontSize * config.quotationMark.sizeRatio);
  const nameOffset = Math.round(clampedFontSize * config.author.gapFromQuoteRatio);

  // Fixed positions from backend
  const quoteMarkY = config.quotationMark.y;
  const quoteY = quoteMarkY + quoteMarkSize + config.quotationMark.gapToText;

  // Calculate text wrapping for author Y position
  const quoteLines = wrapText(quoteText, config.quote.maxWidth, clampedFontSize);
  const quoteTextHeight = quoteLines.length * lineHeight;
  const authorY = quoteY + quoteTextHeight + nameOffset;

  return {
    quoteFontSize: clampedFontSize,
    authorFontSize,
    quoteMarkY,
    quoteMarkSize,
    quoteY,
    authorY,
    lineHeight,
    nameOffset,
    quoteLines,
  };
}

/**
 * Calculate image cover dimensions (aspect ratio fill)
 * Matches backend image cropping logic in zitat_canvas.ts:61-76
 */
export function calculateImageCover(
  imageWidth: number,
  imageHeight: number,
  canvasWidth: number = ZITAT_CONFIG.canvas.width,
  canvasHeight: number = ZITAT_CONFIG.canvas.height
): { sx: number; sy: number; sWidth: number; sHeight: number } {
  const imageAspectRatio = imageWidth / imageHeight;
  const canvasAspectRatio = canvasWidth / canvasHeight;

  let sx: number, sy: number, sWidth: number, sHeight: number;

  if (imageAspectRatio > canvasAspectRatio) {
    // Image is wider than canvas - crop sides
    sHeight = imageHeight;
    sWidth = imageHeight * canvasAspectRatio;
    sx = (imageWidth - sWidth) / 2;
    sy = 0;
  } else {
    // Image is taller than canvas - crop top/bottom
    sWidth = imageWidth;
    sHeight = imageWidth / canvasAspectRatio;
    sx = 0;
    sy = (imageHeight - sHeight) / 2;
  }

  return { sx, sy, sWidth, sHeight };
}
