/**
 * Texte in ihre Box einpassen statt überlaufen lassen. Der Stil setzt die
 * Schrift fest; hier wird sie in 5-%-Schritten bis zum `minScale` der Box
 * verkleinert. Was dann noch zu hoch ist, kommt als Id in `overflow` zurück
 * (der Aufrufer kürzt oder meldet), statt über andere Elemente zu laufen.
 *
 * Rein und knotensicher: Gemessen wird über den übergebenen `MeasureText`
 * (Server: `serverMeasureText`; Tests: ein Fake).
 */

import { stripInlineMarks } from '../text/inlineMarks.js';

import { type SlideLayoutState } from './slideLayouts.js';

/** Höhe von `text`, in `font` auf `width` umbrochen. Folien-px. */
export type MeasureText = (
  text: string,
  font: { family: string; size: number; lineHeight: number },
  width: number
) => { height: number };

export interface FitBox {
  maxHeight: number;
  minScale: number;
}

/**
 * Schlüssel der Listenbox in `deckStilBoxes`. Alle `folie-punkt-n` einer Folie
 * teilen EINEN Maßstab; `maxHeight` gilt je Punkt, nämlich für die Zelle, die
 * der Stil ihm gibt. Das Raster ist fest (Marken, Nummern, Linien, Kacheln und
 * Balken sitzen auf dem Punkt-Abstand), deshalb wird nicht umgestapelt: passt
 * jeder Punkt in seine Zelle, passt auch die Summe aus Texten und Abständen.
 */
export const LIST_BOX_KEY = 'folie-punkt-*';

const LIST_ID = /^folie-punkt-\d+$/;
const STEP = 0.05;

type TextEl = SlideLayoutState['additionalTexts'][number];

function heightOf(el: TextEl, size: number, measure: MeasureText): number {
  // Der Zeilenabstand ist ein Faktor der Schriftgröße und wächst/schrumpft mit ihr;
  // ein Abstand in px, der separat zu skalieren wäre, kennt das Modell nicht.
  return measure(
    stripInlineMarks(el.text),
    { family: el.fontFamily, size, lineHeight: el.lineHeight ?? 1.2 },
    el.width
  ).height;
}

/** 1, 0,95, … bis `minScale`; der letzte Schritt ist genau `minScale`. */
function scalesFor(minScale: number): number[] {
  const out: number[] = [];
  for (let s = 1; s > minScale + 1e-9; s = Math.round((s - STEP) * 1000) / 1000) out.push(s);
  out.push(minScale);
  return out;
}

/** Ein gemeinsamer Maßstab für alle Elemente; liefert die Ids, die auch am Ende noch zu hoch sind. */
function fitGroup(
  els: TextEl[],
  box: FitBox,
  measure: MeasureText,
  base: Record<string, number> | null
): string[] {
  const original = els.map((e) => base?.[e.id] ?? e.fontSize);
  let over: string[] = [];
  for (const scale of scalesFor(box.minScale)) {
    over = [];
    els.forEach((el, i) => {
      el.fontSize = Math.round(original[i]! * scale);
      if (heightOf(el, el.fontSize, measure) > box.maxHeight) over.push(el.id);
    });
    if (over.length === 0) return [];
  }
  return over;
}

export function fitSlideTexts(
  state: SlideLayoutState,
  boxes: Record<string, FitBox>,
  measure: MeasureText,
  /**
   * Ausgangsgröße je Element-Id (die des Stils). Ohne sie gilt die aktuelle Größe als
   * Ausgang; mit ihr schrumpft wiederholtes Bearbeiten nicht kumulativ, und ein
   * kürzerer Text wächst auf die Ausgangsgröße zurück.
   */
  baseSizes: Record<string, number> | null = null
): { state: SlideLayoutState; overflow: string[] } {
  const next = structuredClone(state);
  const overflow: string[] = [];
  for (const [key, box] of Object.entries(boxes)) {
    const els =
      key === LIST_BOX_KEY
        ? next.additionalTexts.filter((t) => LIST_ID.test(t.id))
        : next.additionalTexts.filter((t) => t.id === key);
    if (els.length === 0) continue;
    overflow.push(...fitGroup(els, box, measure, baseSizes));
  }
  return { state: next, overflow };
}
