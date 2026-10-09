/**
 * Textumbruch für die Server-Renderer der Sharepics.
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
 */
import { layoutTextBlock, wrapLines, type LayoutedLine } from '@gruenerator/contracts';

/**
 * Nur das, was gebraucht wird — so passt sowohl der `CanvasRenderingContext2D`
 * der einen Renderer als auch der `SKRSContext2D` von @napi-rs/canvas der
 * anderen, ohne dass dieses Modul eine der beiden Bibliotheken importiert.
 */
export interface MeasuringContext {
  measureText(text: string): { width: number };
}

/** Bindet einen Canvas-Kontext (mit seiner aktuell gesetzten Schrift) als Messfunktion. */
export const measureWith =
  (ctx: MeasuringContext) =>
  (text: string): number =>
    ctx.measureText(text).width;

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

export type { LayoutedLine };
