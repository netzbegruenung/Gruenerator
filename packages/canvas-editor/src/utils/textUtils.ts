/**
 * Shared text utilities for canvas editor
 *
 * Umbruch, Aufzählungsmarker, hängender Einzug und Inline-Auszeichnung liegen
 * in `@gruenerator/contracts` (`text/listLayout.ts`, `text/inlineMarks.ts`) —
 * DOM-frei, damit die Vorschau hier und der Server-Renderer an derselben
 * Stelle umbrechen. Hier bleibt nur, was ein Canvas braucht: die Messung.
 */
import {
  layoutRichTextBlock,
  wrapLines,
  type MeasureRun,
  type RunStyle,
} from '@gruenerator/contracts';

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

/**
 * Konva-`fontStyle` für einen Lauf: Blockstil plus die Marks des Laufs.
 * Konva kennt genau die vier Werte `normal`, `bold`, `italic`, `bold italic`.
 *
 * **Kursiv schlägt fett.** Keine unserer Schriften hat einen Fett-Kursiv-
 * Schnitt, und die beiden Seiten lösen `bold italic` gegensätzlich auf:
 * der Browser nimmt den Kursivschnitt und fettet ihn synthetisch (gemessen:
 * `bold italic` ist exakt so breit wie `italic`), `@napi-rs/canvas` nimmt den
 * Fettschnitt und neigt ihn. Dieselbe Zeile wäre damit ~5 % verschieden breit
 * und bräche in Vorschau und Export an anderer Stelle um — genau das, was der
 * geteilte Umbruch verhindern soll. Also fragen beide Seiten nur `italic` an;
 * ein kursives Wort in einem fetten Block ist dann nicht fett, aber überall
 * gleich.
 */
export function fontStyleForRun(
  baseStyle: string,
  style: RunStyle
): 'normal' | 'bold' | 'italic' | 'bold italic' {
  if (style.italic || baseStyle.includes('italic')) return 'italic';
  return style.bold || baseStyle.includes('bold') ? 'bold' : 'normal';
}

/**
 * Bindet eine konkrete Schrift an eine Messfunktion für `listLayout` — je
 * Lauf mit dessen Stil, denn ein fettes Wort ist breiter, und der Umbruch
 * muss das wissen. Vier mögliche Stile, darum ein kleiner Cache je
 * Kombination statt eines Canvas je Messung.
 *
 * `fontGeneration` ist der Stand von `document.fonts`, gegen den gemessen
 * wird (`useFontGeneration`). Er steht im Cache-Schlüssel, damit er ein
 * echter Eingang der Messung ist — nur so bleibt er im Memo des Aufrufers
 * eine Abhängigkeit, die der React-Compiler nicht wegkürzt.
 */
export function runMeasurer(
  fontSize: number,
  fontFamily: string,
  fontStyle: string = 'normal',
  fontGeneration = 0
): MeasureRun {
  const cache = new Map<string, number>();
  return (text, style) => {
    const konvaStyle = fontStyleForRun(fontStyle, style);
    const key = `${fontGeneration}:${konvaStyle}:${text}`;
    let width = cache.get(key);
    if (width === undefined) {
      width = measureTextWidthWithFont(text, fontSize, fontFamily, konvaStyle);
      cache.set(key, width);
    }
    return width;
  };
}

/**
 * Wrap text using accurate font measurement
 * This produces line breaks that match actual Konva text rendering
 *
 * Bricht auch an `\n`, rechnet den Einzug einer Aufzählung und die Breite
 * fetter Läufe mit — die Zeilenzahl ist genau das, was die Auto-Fit-Schleifen
 * der Vorlagen auswerten. Die Marker stehen in den gelieferten Zeilen wieder
 * vorn, Auszeichnungsmarker sind entfernt, damit Aufrufer, die die Strings
 * zeichnen statt sie zu zählen, sich nicht ändern müssen.
 */
export function wrapTextAccurate(
  text: string,
  maxWidth: number,
  fontSize: number,
  fontFamily: string,
  fontStyle: string = 'normal'
): string[] {
  return layoutRichTextBlock(text, maxWidth, runMeasurer(fontSize, fontFamily, fontStyle)).map(
    (line) => {
      const body = line.runs.map((run) => run.text).join('');
      return line.marker ? `${line.marker} ${body}` : body;
    }
  );
}
