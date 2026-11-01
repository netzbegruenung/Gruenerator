// SPDX-License-Identifier: MPL-2.0
/**
 * Die Kästen eines `++Marker++`-Textes — rein geometrisch, ohne Konva, damit
 * der Umbruch pro Zeilenstück testbar ist (`markerBoxes.vitest.ts`).
 *
 * Ein Kasten je Zeile und je zusammenhängender Strecke markierter Läufe: bricht
 * eine Passage um, bekommt jede Zeile ihr eigenes Stück, wie beim Textmarker.
 * Das Leerzeichen hinter dem letzten markierten Wort gehört nicht in den
 * Kasten (der Lauf trägt es, weil ein Wort den Stil seines Leerzeichens erbt).
 * Steht daneben ein unmarkiertes Wort in derselben Zeile, ragt der Kasten nur
 * knapp ins Leerzeichen: sonst stößt er an das Nachbarwort, dessen kursive
 * Glyphen ohnehin schon hineinlehnen.
 */
import { activeBrand } from '@ggraphic/editor/brand/brandRegistry';

import { markerInkOn } from './markerColors.js';

import type { TextMarker } from './textUtils.js';
import type { BrandPack } from '@ggraphic/core';
import type { MeasureRun, RichLayoutedLine } from '@ggraphic/schema';

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
  /** Das Markenpaket, dessen dunkle Schrift ein frei gewählter Kasten bekommt; Vorgabe: das aktive. */
  brand?: BrandPack;
}

const DEFAULT_PAD_X = 0.18;
const DEFAULT_PAD_Y = 0.02;
/** Die Glyphen füllen etwa diesen Teil der Schriftgröße; der Kasten umfasst sie knapp. */
const GLYPH_BODY = 1.0;
/** So viel des Leerzeichens zu einem Nachbarwort darf der Kasten höchstens belegen. */
const NEIGHBOUR_SPACE_SHARE = 0.3;

export function markerBoxes(
  lines: RichLayoutedLine[],
  measure: MeasureRun,
  marker: TextMarker,
  { fontSize, lineHeightPx, top, originX, brand = activeBrand() }: MarkerBoxOptions
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
    let padLeft = padX;
    let last: RichLayoutedLine['runs'][number] | undefined;
    const beside = (run: RichLayoutedLine['runs'][number]) =>
      Math.min(padX, NEIGHBOUR_SPACE_SHARE * measure(' ', run));
    const close = (neighbour: boolean) => {
      if (start === null) return;
      const padRight = neighbour && last ? beside(last) : padX;
      boxes.push({
        line: index,
        x: base + start - padLeft,
        y: lineTop,
        width: end - start + padLeft + padRight,
        height,
        fill: color ?? marker.fill,
        ink: color ? markerInkOn(color, brand) : marker.color,
      });
      start = null;
    };
    line.runs.forEach((run, i) => {
      if (!run.marker) {
        close(true);
        return;
      }
      // Eine andersfarbige Passage direkt daneben bekommt ihren eigenen Kasten.
      if (start !== null && run.markerColor !== color) close(false);
      if (start === null) {
        start = run.x;
        color = run.markerColor;
        const prev = line.runs[i - 1];
        padLeft = prev && !prev.marker ? beside(prev) : padX;
      }
      last = run;
      const next = line.runs[i + 1];
      // Das Leerzeichen am Ende der Strecke bleibt draußen.
      const visible = next?.marker && next.markerColor === color ? run.text : run.text.trimEnd();
      end = run.x + measure(visible, run);
    });
    close(false);
  });
  return boxes;
}
