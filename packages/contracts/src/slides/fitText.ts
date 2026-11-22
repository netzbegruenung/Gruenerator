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

/**
 * Ein senkrechter Fluss: die Elemente stehen in dieser Reihenfolge untereinander,
 * jedes so hoch, wie sein umbrochener Text gemessen ist. Feste y-Werte im Stil
 * kennen die Zeilenzahl nicht; eine zweizeilige Überschrift lief so in die Zeile
 * darunter, und drei kurze Listenpunkte ließen die halbe Folie leer.
 */
export interface FlowSpec {
  /** Element-Ids von oben nach unten; `LIST_BOX_KEY` steht für alle Listenpunkte. Fehlende entfallen. */
  ids: readonly string[];
  /** Oberkante des Bereichs. */
  top: number;
  /** Beginnt der Bereich erst unter einem Element (meist der Überschrift): dessen Id und der Abstand. */
  below?: { id: string; gap: number };
  /** Unterkante des Bereichs (über der Fußzeile). */
  bottom: number;
  /** `top`: ab der Oberkante; `center`: mittig im Bereich. */
  align: 'top' | 'center';
  /** Abstand nach einem Element, als Faktor seiner Schriftgröße. */
  gapEm: number;
  /** Abweichender Abstand nach bestimmten Elementen, in px. */
  gapAfter?: Readonly<Record<string, number>>;
  /**
   * Begleiter der Listenpunkte (Marke, Nummer, Trennlinie): Präfix der Id, die
   * Nummer des Punkts hängt daran. `top`/`bottom`: an Ober- bzw. Unterkante des
   * gesetzten Punkts, plus `dy`. Bei Formen ist `y` die Mitte. Ohne sie blieben
   * die Marken auf dem alten Raster, während der Text wandert.
   */
  follow?: Readonly<Record<string, { anchor: 'top' | 'bottom'; dy: number }>>;
}

function flowMembers(state: SlideLayoutState, ids: readonly string[]): TextEl[] {
  return ids.flatMap((id) =>
    id === LIST_BOX_KEY
      ? state.additionalTexts.filter((t) => LIST_ID.test(t.id))
      : state.additionalTexts.filter((t) => t.id === id)
  );
}

/** Setzt die y-Werte der Fluss-Elemente; liefert die Ids, die unter `bottom` hinausragen. */
export function flowSlideTexts(
  state: SlideLayoutState,
  flow: FlowSpec,
  measure: MeasureText
): string[] {
  const els = flowMembers(state, flow.ids).filter((el) => stripInlineMarks(el.text).trim() !== '');
  if (els.length === 0) return [];
  const anchor = flow.below
    ? state.additionalTexts.find((t) => t.id === flow.below!.id)
    : undefined;
  const top = anchor
    ? Math.max(flow.top, anchor.y + heightOf(anchor, anchor.fontSize, measure) + flow.below!.gap)
    : flow.top;
  const heights = els.map((el) => heightOf(el, el.fontSize, measure));
  const gaps = els.map((el, i) =>
    i === els.length - 1 ? 0 : (flow.gapAfter?.[el.id] ?? Math.round(el.fontSize * flow.gapEm))
  );
  const total = heights.reduce((a, h) => a + h, 0) + gaps.reduce((a, g) => a + g, 0);
  const room = flow.bottom - top;
  let y = flow.align === 'center' && total < room ? top + Math.round((room - total) / 2) : top;
  const over: string[] = [];
  els.forEach((el, i) => {
    el.y = Math.round(y);
    y += heights[i]! + gaps[i]!;
    if (el.y + heights[i]! > flow.bottom) over.push(el.id);
    const n = LIST_ID.test(el.id) ? el.id.slice('folie-punkt-'.length) : null;
    for (const [prefix, f] of Object.entries(n ? (flow.follow ?? {}) : {})) {
      const mate =
        state.additionalTexts.find((t) => t.id === `${prefix}${n}`) ??
        state.shapeInstances.find((s) => s.id === `${prefix}${n}`);
      if (mate) mate.y = Math.round((f.anchor === 'top' ? el.y : el.y + heights[i]!) + f.dy);
    }
  });
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
  baseSizes: Record<string, number> | null = null,
  /** Nach dem Einpassen: die Elemente nach gemessener Höhe untereinander setzen. */
  flow: FlowSpec | null = null
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
  if (flow) {
    let over = flowSlideTexts(next, flow, measure);
    // Passt jeder Punkt in seine Zelle, aber nicht die ganze Liste in den Bereich:
    // die Punkte schrumpfen gemeinsam weiter, bis zum `minScale` ihrer Box.
    const listBox = boxes[LIST_BOX_KEY];
    const items = next.additionalTexts.filter((t) => LIST_ID.test(t.id));
    if (over.length > 0 && listBox && items.length > 0) {
      const original = items.map((el) => baseSizes?.[el.id] ?? el.fontSize);
      const start = items[0]!.fontSize / original[0]!;
      for (const scale of scalesFor(listBox.minScale).filter((s) => s < start - 1e-9)) {
        items.forEach((el, i) => (el.fontSize = Math.round(original[i]! * scale)));
        over = flowSlideTexts(next, flow, measure);
        if (over.length === 0) break;
      }
    }
    for (const id of over) {
      if (!overflow.includes(id)) overflow.push(id);
    }
  }
  return { state: next, overflow };
}
