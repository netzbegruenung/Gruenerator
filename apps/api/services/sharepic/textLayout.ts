/**
 * Textumbruch und -zeichnen für die Server-Renderer der Sharepics.
 *
 * Bis hierher brachte JEDE Renderdatei ihr eigenes `wrapText` mit — acht
 * Kopien, alle mit demselben Fehler: sie splitteten `text.split(' ')` und
 * kannten `\n` nicht. Die „Zeile", die dabei herauskam, trug den Umbruch dann
 * noch in sich, und `fillText` ignoriert ihn — eine Aufzählung landete
 * vollständig übereinander auf einer Zeile.
 *
 * Die Logik selbst liegt in `@gruenerator/contracts` und wird vom Client-Editor
 * genauso benutzt. Das ist der Punkt: Vorschau und Export brechen an derselben
 * Stelle um, statt zwei Verfahren zu fahren, die auseinanderdriften.
 *
 * Fett, Kursiv und Unterstrichen stehen als Markdown-lite im Text
 * (`**fett**`, `_kursiv_`, `<u>…</u>`). `drawRichTextLines` setzt je Lauf die
 * Schrift um und zeichnet den Unterstrich selbst — ein Canvas-Kontext kennt
 * keine Textdekoration.
 */
import {
  PLAIN_STYLE,
  layoutRichTextBlock,
  layoutTextBlock,
  wrapLines,
  type LayoutedLine,
  type MeasureRun,
  type RichLayoutedLine,
  type RunStyle,
} from '@gruenerator/contracts';

/**
 * Nur das, was gebraucht wird — so passt sowohl der `CanvasRenderingContext2D`
 * der einen Renderer als auch der `SKRSContext2D` von @napi-rs/canvas der
 * anderen, ohne dass dieses Modul eine der beiden Bibliotheken importiert.
 */
export interface MeasuringContext {
  measureText(text: string): { width: number };
}

export interface FontContext extends MeasuringContext {
  font: string;
}

export interface DrawingContext extends FontContext {
  fillStyle: string | CanvasGradient | CanvasPattern;
  fillText(text: string, x: number, y: number): void;
  fillRect(x: number, y: number, width: number, height: number): void;
}

/** Grundschrift eines Textblocks; Läufe schalten Fett/Kursiv darauf zu. */
export interface BlockFont {
  fontFamily: string;
  fontSize: number;
  /** `normal` | `bold` | `italic` | `bold italic` — Stil des ganzen Blocks. */
  fontStyle?: string;
}

/** Bindet einen Canvas-Kontext (mit seiner aktuell gesetzten Schrift) als Messfunktion. */
export const measureWith =
  (ctx: MeasuringContext) =>
  (text: string): number =>
    ctx.measureText(text).width;

/**
 * CSS-Font-String für einen Lauf: Blockstil plus die Marks des Laufs.
 *
 * **Kursiv schlägt fett** — dieselbe Regel wie im Editor
 * (`textUtils.fontStyleForRun`). Keine unserer Schriften hat einen
 * Fett-Kursiv-Schnitt, und die beiden Seiten lösen `bold italic` gegensätzlich
 * auf: der Browser nimmt den Kursivschnitt und fettet synthetisch,
 * `@napi-rs/canvas` nimmt den Fettschnitt und neigt ihn — ~5 % Breitenunterschied
 * und ein anderer Umbruch in Vorschau und Export. Also fragen beide nur
 * `italic` an.
 */
export function fontForRun(font: BlockFont, style: RunStyle): string {
  const base = font.fontStyle ?? 'normal';
  if (style.italic || base.includes('italic'))
    return `italic ${font.fontSize}px ${font.fontFamily}`;
  const bold = style.bold || base.includes('bold');
  return `${bold ? 'bold ' : ''}${font.fontSize}px ${font.fontFamily}`;
}

/** Messfunktion, die vor jedem Maß die Schrift des Laufs setzt. */
export const measureRunWith =
  (ctx: FontContext, font: BlockFont): MeasureRun =>
  (text, style) => {
    ctx.font = fontForRun(font, style);
    return ctx.measureText(text).width;
  };

/**
 * Umbruch auf `maxWidth` — an Wortgrenzen UND an `\n`.
 * Ersatz für die privaten `wrapText`-Kopien der Renderer.
 */
export function wrapTextLines(ctx: MeasuringContext, text: string, maxWidth: number): string[] {
  return wrapLines(text, maxWidth, measureWith(ctx));
}

/**
 * Wie {@link wrapTextLines}, liefert aber zusätzlich Marker und Einzug je
 * Zeile. Wer das zeichnet, addiert `indent` auf sein `x` und setzt `marker`
 * am linken Rand — so steht eine umbrechende Aufzählung mit hängendem Einzug
 * statt auf Spalte 0 zurückzuspringen.
 */
export function layoutTextLines(
  ctx: MeasuringContext,
  text: string,
  maxWidth: number
): LayoutedLine[] {
  return layoutTextBlock(text, maxWidth, measureWith(ctx));
}

/** Zeilen als Läufe mit Position — gemessen mit der Schrift jedes Laufs. */
export function layoutRichTextLines(
  ctx: FontContext,
  text: string,
  maxWidth: number,
  font: BlockFont
): RichLayoutedLine[] {
  return layoutRichTextBlock(text, maxWidth, measureRunWith(ctx, font));
}

export interface DrawRichLinesOptions {
  x: number;
  y: number;
  lineHeight: number;
  font: BlockFont;
  color: string;
}

/**
 * Zeichnet fertig gesetzte Zeilen mit `textBaseline = 'top'`: Marker am
 * Blockrand, Läufe um Einzug und Laufposition nach rechts, Unterstrich als
 * Balken unter der Grundlinie. Liefert das `y` unter der letzten Zeile.
 */
export function drawRichLines(
  ctx: DrawingContext,
  lines: RichLayoutedLine[],
  options: DrawRichLinesOptions
): number {
  const { x, y, lineHeight, font, color } = options;
  // Bei `textBaseline = 'top'` liegt die Grundlinie etwa bei 0,9 · fontSize;
  // der Balken sitzt knapp darunter, seine Stärke wächst mit der Schrift.
  const underlineY = font.fontSize;
  const underlineHeight = Math.max(1, Math.round(font.fontSize / 14));

  let currentY = y;
  ctx.fillStyle = color;
  for (const line of lines) {
    if (line.marker !== null) {
      ctx.font = fontForRun(font, PLAIN_STYLE);
      ctx.fillText(line.marker, x, currentY);
    }
    for (const run of line.runs) {
      ctx.font = fontForRun(font, run);
      const runX = x + line.indent + run.x;
      ctx.fillText(run.text, runX, currentY);
      if (run.underline) {
        ctx.fillRect(runX, currentY + underlineY, ctx.measureText(run.text).width, underlineHeight);
      }
    }
    currentY += lineHeight;
  }
  return currentY;
}

/** Setzt `text` auf `maxWidth` und zeichnet ihn — siehe {@link drawRichLines}. */
export function drawRichTextLines(
  ctx: DrawingContext,
  text: string,
  options: DrawRichLinesOptions & { maxWidth: number }
): number {
  return drawRichLines(
    ctx,
    layoutRichTextLines(ctx, text, options.maxWidth, options.font),
    options
  );
}

export type { LayoutedLine, RichLayoutedLine };
