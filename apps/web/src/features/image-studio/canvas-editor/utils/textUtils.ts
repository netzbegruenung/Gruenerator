/**
 * Shared text utilities for canvas editor
 */

/**
 * Simple text wrapping using character width estimation
 * @deprecated Use wrapTextAccurate() for accurate font-aware wrapping
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
 * Measure actual text width using Canvas 2D context
 * Uses browser's font rendering engine for accurate measurements
 *
 * @param text - The text to measure
 * @param fontSize - Font size in pixels
 * @param fontFamily - Font family name (e.g., 'GrueneTypeNeue', 'PT Sans')
 * @param fontStyle - CSS font style (e.g., 'normal', 'bold', 'italic', 'bold italic')
 */
export function measureTextWidthWithFont(
  text: string,
  fontSize: number,
  fontFamily: string,
  fontStyle: string = 'normal'
): number {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    // Fallback to estimation if canvas unavailable
    return text.length * fontSize * 0.5;
  }

  // Build CSS font string (e.g., "bold italic 90px GrueneTypeNeue, Arial, sans-serif")
  ctx.font = `${fontStyle} ${fontSize}px ${fontFamily}, Arial, sans-serif`;

  // Warn in development if font not loaded
  if (import.meta.env.DEV) {
    const isLoaded = document.fonts.check(`${fontStyle} ${fontSize}px ${fontFamily}`);
    if (!isLoaded) {
      console.warn(
        `[textUtils] Font "${fontFamily}" (${fontStyle}) not loaded, measurements may be inaccurate`
      );
    }
  }

  return ctx.measureText(text).width;
}

/**
 * Wrap text using accurate font measurement
 * This produces line breaks that match actual Konva text rendering
 */
export function wrapTextAccurate(
  text: string,
  maxWidth: number,
  fontSize: number,
  fontFamily: string,
  fontStyle: string = 'normal'
): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const testWidth = measureTextWidthWithFont(testLine, fontSize, fontFamily, fontStyle);

    if (testWidth <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);

  return lines;
}
