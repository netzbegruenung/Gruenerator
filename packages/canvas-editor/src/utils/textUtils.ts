/**
 * Shared text utilities for canvas editor
 *
 * Umbruch, Aufzählungsmarker und hängender Einzug liegen in
 * `@gruenerator/contracts` (`text/listLayout.ts`) — DOM-frei, damit die
 * Vorschau hier und der Server-Renderer an derselben Stelle umbrechen. Hier
 * bleibt nur, was ein Canvas braucht: die Messung.
 */
import { layoutTextBlock, wrapLines, type MeasureText } from '@gruenerator/contracts';

const _warnedFonts = new Set<string>();

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
  return wrapLines(text, maxWidth, (value) => value.length * fontSize * charWidthRatio);
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
  // Ohne DOM (Tests, SSR) gibt es kein Canvas zum Messen — dann auf die
  // Schätzung zurückfallen statt zu werfen.
  const ctx =
    typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  if (!ctx) {
    // Fallback to estimation if canvas unavailable
    return text.length * fontSize * 0.5;
  }

  // Build CSS font string (e.g., "bold italic 90px GrueneTypeNeue, Arial, sans-serif")
  ctx.font = `${fontStyle} ${fontSize}px ${fontFamily}, Arial, sans-serif`;

  // Warn once per font/style combo in development
  if (typeof process !== 'undefined' && process.env.NODE_ENV === 'development') {
    const fontKey = `${fontFamily}:${fontStyle}`;
    if (!_warnedFonts.has(fontKey)) {
      const isLoaded = document.fonts.check(`${fontStyle} ${fontSize}px ${fontFamily}`);
      if (!isLoaded) {
        _warnedFonts.add(fontKey);
        console.warn(
          `[textUtils] Font "${fontFamily}" (${fontStyle}) not loaded, measurements may use fallback. This warning appears once per font.`
        );
      }
    }
  }

  return ctx.measureText(text).width;
}

/** Bindet eine konkrete Schrift an eine Messfunktion für `listLayout`. */
export function textMeasurer(
  fontSize: number,
  fontFamily: string,
  fontStyle: string = 'normal'
): MeasureText {
  return (text: string) => measureTextWidthWithFont(text, fontSize, fontFamily, fontStyle);
}

/**
 * Wrap text using accurate font measurement
 * This produces line breaks that match actual Konva text rendering
 *
 * Bricht auch an `\n` und rechnet den Einzug einer Aufzählung mit — die
 * Zeilenzahl ist genau das, was die Auto-Fit-Schleifen der Vorlagen auswerten.
 * Die Marker stehen in den gelieferten Zeilen wieder vorn, damit Aufrufer, die
 * die Strings zeichnen statt sie zu zählen, sich nicht ändern müssen.
 */
export function wrapTextAccurate(
  text: string,
  maxWidth: number,
  fontSize: number,
  fontFamily: string,
  fontStyle: string = 'normal'
): string[] {
  return layoutTextBlock(text, maxWidth, textMeasurer(fontSize, fontFamily, fontStyle)).map(
    (line) => (line.marker ? `${line.marker} ${line.text}` : line.text)
  );
}
