/**
 * Overflow check for composed slide decks. A slot's character budget is a
 * guess about width; this measures the wrapped text in the layout's own font
 * (via the deck metrics) and compares its bottom edge with the slot's limit.
 */

import { stripInlineMarks } from '@gruenerator/contracts';
import { getBrandPack } from '@gruenerator/contracts/brand';
import {
  slideSlotsOf,
  type MeasureText,
  type ComposedSlidePage,
  type SlideDeckSpec,
} from '@gruenerator/contracts/slides';

import {
  countLinesSync,
  deckFaces,
  faceRegistered,
  metricsReady,
} from '../../routes/presentations/slideTextMetrics.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('canvasDeckOverflow');

type Brand = 'de-DE' | 'de-AT';

export interface SlotOverflow {
  /** 1-based slide number. */
  slide: number;
  slot: string;
  lines: number;
  /** How far the text reaches below its limit, in slide px. */
  excess: number;
}

/** Lowest allowed size factor when shrinking. */
export const MIN_SHRINK = 0.7;
const SHRINK_STEP = 0.9;

let warned = false;

/**
 * Measuring needs @napi-rs/canvas and the brand fonts (private content
 * checkout). Without them the budgets alone have to hold; says so once.
 */
export async function prepareOverflowMeasuring(brand: Brand): Promise<boolean> {
  const ready = await metricsReady();
  const faces = deckFaces(brand);
  const ok = ready && faceRegistered(faces.heading) && faceRegistered(faces.body);
  if (!ok && !warned) {
    warned = true;
    log.warn('Markenschrift nicht verfügbar — Überlauf wird nur über die Zeichenbudgets begrenzt');
  }
  return ok;
}

function layoutOf(page: ComposedSlidePage, spec: SlideDeckSpec, index: number) {
  const slide = spec.slides[index];
  return slide ? slideSlotsOf(slide.layout) : null;
}

function bottomOf(
  page: ComposedSlidePage,
  elementId: string,
  brand: Brand
): { bottom: number; lines: number } | null {
  const el = page.state.additionalTexts.find((t) => t.id === elementId);
  if (!el) return null;
  const faces = deckFaces(brand);
  const heading = el.type === 'header' || el.type === 'subheader';
  const size = el.fontSize;
  const lines = countLinesSync([{ text: stripInlineMarks(el.text) }], {
    maxWidthPx: el.width ?? 0,
    fontPx: size,
    faces,
    face: heading ? faces.heading : faces.body,
  });
  if (lines === null) return null;
  return { bottom: el.y + lines * size * (el.lineHeight ?? 1), lines };
}

/** Slots whose text runs past their limit. Needs `prepareOverflowMeasuring` first. */
export function findSlotOverflows(
  pages: ComposedSlidePage[],
  spec: SlideDeckSpec,
  brand: Brand
): SlotOverflow[] {
  const found: SlotOverflow[] = [];
  pages.forEach((page, index) => {
    const def = layoutOf(page, spec, index);
    if (!def) return;
    for (const [name, slot] of Object.entries(def)) {
      const m = bottomOf(page, slot.elementId, brand);
      if (m && m.bottom > slot.bottom) {
        found.push({
          slide: index + 1,
          slot: name,
          lines: m.lines,
          excess: m.bottom - slot.bottom,
        });
      }
    }
  });
  return found;
}

/**
 * Shrinks the font of each overflowing slot stepwise, never below
 * {@link MIN_SHRINK} of its original size. Returns what still overflows.
 */
export function shrinkOverflows(
  pages: ComposedSlidePage[],
  spec: SlideDeckSpec,
  brand: Brand
): SlotOverflow[] {
  for (const o of findSlotOverflows(pages, spec, brand)) {
    const page = pages[o.slide - 1];
    const def = page && layoutOf(page, spec, o.slide - 1);
    const slot = def && Object.entries(def).find(([n]) => n === o.slot)?.[1];
    const el = page?.state.additionalTexts.find((t) => t.id === slot?.elementId);
    if (!page || !slot || !el) continue;
    const original = el.fontSize;
    let scale = 1;
    while (scale > MIN_SHRINK) {
      scale = Math.max(MIN_SHRINK, scale * SHRINK_STEP);
      el.fontSize = Math.round(original * scale);
      const m = bottomOf(page, slot.elementId, brand);
      if (m && m.bottom <= slot.bottom) break;
    }
  }
  return findSlotOverflows(pages, spec, brand);
}

/**
 * Der Messer für `fitSlideTexts`: dieselbe Zeilenzählung wie oben, Schrift
 * nach Familie des Elements (Überschriftenschrift der Marke → Deck-Kopfschrift,
 * Betonungsschrift → Zitatschrift, sonst Fließschrift). Null, wenn Markenschrift
 * oder Canvas fehlen — dann gelten allein die Zeichenbudgets. Braucht
 * `prepareOverflowMeasuring` vorher.
 */
export function serverMeasureText(brand: Brand): MeasureText | null {
  const faces = deckFaces(brand);
  const fonts = getBrandPack(brand).fonts;
  const faceFor = (family: string) => {
    if (family === fonts.headline || family === fonts.quoteShort) return faces.heading;
    if (family === fonts.quoteEmphasis && faces.quote) return faces.quote;
    return faces.body;
  };
  const probe = countLinesSync([{ text: 'x' }], {
    maxWidthPx: 100,
    fontPx: 20,
    faces,
    face: faces.body,
  });
  if (probe === null || !faceRegistered(faces.heading) || !faceRegistered(faces.body)) return null;
  return (text, font, width) => {
    const lines =
      countLinesSync([{ text }], {
        maxWidthPx: width,
        fontPx: font.size,
        faces,
        face: faceFor(font.family),
      }) ?? 1;
    return { height: lines * font.size * font.lineHeight };
  };
}
