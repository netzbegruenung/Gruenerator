/**
 * Die Kästen eines `++Marker++`-Textes — rein geometrisch, ohne Konva, damit
 * der Umbruch pro Zeilenstück testbar ist (`markerBoxes.vitest.ts`).
 *
 * Ein Kasten je Zeile und je zusammenhängender Strecke markierter Läufe: bricht
 * eine Passage um, bekommt jede Zeile ihr eigenes Stück, wie beim Textmarker.
 * Das Leerzeichen hinter dem letzten markierten Wort gehört nicht in den
 * Kasten (der Lauf trägt es, weil ein Wort den Stil seines Leerzeichens erbt).
 */
import { markerInkOn } from './markerColors';

import type { TextMarker } from './textUtils';
import type { MeasureRun, RichLayoutedLine } from '@gruenerator/contracts';

export interface MarkerBox {
  line: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Kastenfarbe: die der Passage, sonst die des Markerstils. */
  fill: string;
  /** Schriftfarbe im Kasten. */
  ink: string;
}

export interface MarkerBoxOptions {
  fontSize: number;
  /** Zeilenabstand in px (Schriftgröße mal `lineHeight`). */
  lineHeightPx: number;
  /** Oberkante des Textblocks. */
  top: number;
  /** Linke Kante jeder Zeile (Rand, Ausrichtungsversatz) — ohne Einzug. */
  originX: number[];
}

const DEFAULT_PAD_X = 0.18;
const DEFAULT_PAD_Y = 0.02;
/** Die Glyphen füllen etwa diesen Teil der Schriftgröße; der Kasten umfasst sie knapp. */
const GLYPH_BODY = 1.0;

export function markerBoxes(
  lines: RichLayoutedLine[],
  measure: MeasureRun,
  marker: TextMarker,
  { fontSize, lineHeightPx, top, originX }: MarkerBoxOptions
): MarkerBox[] {
  const padX = (marker.padX ?? DEFAULT_PAD_X) * fontSize;
  const padY = (marker.padY ?? DEFAULT_PAD_Y) * fontSize;
  const height = Math.min(fontSize * GLYPH_BODY + 2 * padY, lineHeightPx);
  const boxes: MarkerBox[] = [];

  lines.forEach((line, index) => {
    const base = (originX[index] ?? 0) + line.indent;
    const lineTop = top + index * lineHeightPx + (lineHeightPx - height) / 2;
    let start: number | null = null;
    let end = 0;
    let color: string | undefined;
    const close = () => {
      if (start === null) return;
      boxes.push({
        line: index,
        x: base + start - padX,
        y: lineTop,
        width: end - start + 2 * padX,
        height,
        fill: color ?? marker.fill,
        ink: color ? markerInkOn(color) : marker.color,
      });
      start = null;
    };
    line.runs.forEach((run, i) => {
      if (!run.marker) {
        close();
        return;
      }
      // Eine andersfarbige Passage direkt daneben bekommt ihren eigenen Kasten.
      if (start !== null && run.markerColor !== color) close();
      if (start === null) {
        start = run.x;
        color = run.markerColor;
      }
      const next = line.runs[i + 1];
      // Das Leerzeichen am Ende der Strecke bleibt draußen.
      const visible = next?.marker && next.markerColor === color ? run.text : run.text.trimEnd();
      end = run.x + measure(visible, run);
    });
    close();
  });
  return boxes;
}
