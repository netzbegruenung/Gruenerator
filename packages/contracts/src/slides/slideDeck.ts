/**
 * Foliensatz-Entwurf der Chat-Präsentation: die KI füllt nur Textfelder
 * („Slots") der CD-Layouts, `composeSlideDeck` baut daraus die Canvas-Seiten.
 *
 * Stufe 1 kennt nur Textlayouts — Foto-, Bild- und Diagrammfolien fehlen
 * bewusst. Die Slot-Namen und Zeichenbudgets stehen an genau einer Stelle,
 * `SLIDE_TEXT_SLOTS`; Schema, Prompt und Komposition leiten davon ab. Die
 * Element-Ids gehören den Layout-Bauern (`slideLayouts.ts`), ein Test hält
 * beide Seiten zusammen.
 */

import { z } from 'zod';

import { type BrandLocale } from '../brand/grueneBrand.js';
import { stripInlineMarks } from '../text/inlineMarks.js';

import {
  buildSlideLayout,
  slideLayoutConfigId,
  type SlideLayoutId,
  type SlideLayoutState,
} from './slideLayouts.js';

export interface SlideSlot {
  /** Id des Textelements im Layout. */
  elementId: string;
  /** Zeichenbudget (ohne Inline-Markierungen), bei dem der Text auf die Folie passt. */
  maxChars: number;
  /** Unterkante des Feldes in Folien-px (1080 hoch): darüber wäre der Text zu hoch. */
  bottom: number;
  /** Pflicht: fehlt das Feld, lehnt das Schema ab. Sonst entfernt der Composer das Element. */
  required: boolean;
  /** Kurzer Hinweis für den Prompt. */
  hint: string;
}

const FOOTER_TOP = 1010;

/**
 * Die füllbaren Textfelder je Layout. Fußzeile (Datum, Titel, Seitenzahl)
 * gehört dem Composer. `removed` sind Platzhalter-Elemente des Layouts, die
 * die Folie nicht trägt (Störer mit „Hier steht der Störer-Text").
 */
export const SLIDE_TEXT_SLOTS = {
  titel: {
    label: 'Titelfolie (dunkel)',
    use: 'Deckblatt: große Schlagzeile plus kurzer Anlass',
    slots: {
      headline: {
        elementId: 'folie-headline',
        maxChars: 14,
        bottom: 400,
        required: true,
        hint: 'Schlagzeile, ein bis zwei kurze Wörter',
      },
      text: {
        elementId: 'folie-text',
        maxChars: 280,
        bottom: FOOTER_TOP,
        required: false,
        hint: 'Anlass, Ort, Datum oder ein Einstiegssatz',
      },
    },
    removed: [],
  },
  'titel-hell': {
    label: 'Titelfolie (hell)',
    use: 'Deckblatt auf hellem Grund',
    slots: {
      headline: {
        elementId: 'folie-headline',
        maxChars: 14,
        bottom: 400,
        required: true,
        hint: 'Schlagzeile, ein bis zwei kurze Wörter',
      },
      text: {
        elementId: 'folie-text',
        maxChars: 280,
        bottom: FOOTER_TOP,
        required: false,
        hint: 'Anlass, Ort, Datum oder ein Einstiegssatz',
      },
    },
    removed: [],
  },
  textfolie: {
    label: 'Textfolie (dunkel)',
    use: 'Inhaltsfolie mit Überschrift und ein bis zwei Textspalten',
    slots: {
      headline: {
        elementId: 'folie-headline',
        maxChars: 22,
        bottom: 290,
        required: true,
        hint: 'Überschrift der Folie',
      },
      spalte1: {
        elementId: 'folie-spalte-1',
        maxChars: 420,
        bottom: FOOTER_TOP,
        required: true,
        hint: 'linke Spalte; Aufzählungspunkte mit "• " beginnen, je Zeile einer',
      },
      spalte2: {
        elementId: 'folie-spalte-2',
        maxChars: 420,
        bottom: FOOTER_TOP,
        required: false,
        hint: 'rechte Spalte, weglassen bei nur einer Spalte',
      },
    },
    removed: ['folie-stoerer', 'folie-stoerer-text'],
  },
  'textfolie-hell': {
    label: 'Textfolie (hell)',
    use: 'Inhaltsfolie auf hellem Grund',
    slots: {
      headline: {
        elementId: 'folie-headline',
        maxChars: 22,
        bottom: 290,
        required: true,
        hint: 'Überschrift der Folie',
      },
      spalte1: {
        elementId: 'folie-spalte-1',
        maxChars: 420,
        bottom: FOOTER_TOP,
        required: true,
        hint: 'linke Spalte; Aufzählungspunkte mit "• " beginnen, je Zeile einer',
      },
      spalte2: {
        elementId: 'folie-spalte-2',
        maxChars: 420,
        bottom: FOOTER_TOP,
        required: false,
        hint: 'rechte Spalte, weglassen bei nur einer Spalte',
      },
    },
    removed: ['folie-stoerer', 'folie-stoerer-text'],
  },
  zitat: {
    label: 'Zitat (dunkel)',
    use: 'Kernbotschaft oder Zitat groß auf einer Folie',
    slots: {
      intro: {
        elementId: 'folie-intro',
        maxChars: 55,
        bottom: 335,
        required: false,
        hint: 'kurze Einleitung über dem Zitat',
      },
      zitat: {
        elementId: 'folie-zitat',
        maxChars: 100,
        bottom: FOOTER_TOP,
        required: true,
        hint: 'der Satz; ==Wort== hebt Wörter hervor',
      },
    },
    removed: [],
  },
  'zitat-hell': {
    label: 'Zitat (hell)',
    use: 'Kernbotschaft auf hellem Grund',
    slots: {
      intro: {
        elementId: 'folie-intro',
        maxChars: 55,
        bottom: 335,
        required: false,
        hint: 'kurze Einleitung über dem Zitat',
      },
      zitat: {
        elementId: 'folie-zitat',
        maxChars: 100,
        bottom: FOOTER_TOP,
        required: true,
        hint: 'der Satz; ==Wort== hebt Wörter hervor',
      },
    },
    removed: [],
  },
  danke: {
    label: 'Vielen Dank',
    use: 'Schlussfolie mit Dank und optional Kontaktdaten',
    slots: {
      text: {
        elementId: 'folie-text',
        maxChars: 40,
        bottom: FOOTER_TOP,
        required: false,
        hint: 'Schlusssatz unter „Vielen Dank“',
      },
      kontakt: {
        elementId: 'folie-kontakt',
        maxChars: 200,
        bottom: FOOTER_TOP,
        required: false,
        hint: 'Kontaktdaten, nur wenn der Auftrag sie nennt — nie erfinden',
      },
    },
    removed: [],
  },
} as const satisfies Partial<
  Record<
    SlideLayoutId,
    {
      label: string;
      use: string;
      slots: Record<string, SlideSlot>;
      removed: readonly string[];
    }
  >
>;

export type SlideTextLayoutId = keyof typeof SLIDE_TEXT_SLOTS;

/** Die erlaubten Textlayouts, abgeleitet aus der Slot-Tabelle (und damit aus `SLIDE_LAYOUTS`). */
/** Die Felder eines Layouts als einheitlich getypte Tabelle (die Konstante ist je Layout enger typisiert). */
export function slideSlotsOf(layout: SlideTextLayoutId): Readonly<Record<string, SlideSlot>> {
  return SLIDE_TEXT_SLOTS[layout].slots;
}

export const SLIDE_TEXT_LAYOUT_IDS = Object.keys(SLIDE_TEXT_SLOTS) as [
  SlideTextLayoutId,
  ...SlideTextLayoutId[],
];

export const slideTextLayoutIdSchema = z.enum(SLIDE_TEXT_LAYOUT_IDS);

export const MAX_SLIDES = 30;
/** Die Fußzeile fasst gut 50 Zeichen. */
export const MAX_DECK_TITLE_CHARS = 50;

type SlotsOf<L extends SlideTextLayoutId> = (typeof SLIDE_TEXT_SLOTS)[L]['slots'];

const visibleLength = (s: string) => stripInlineMarks(s).trim().length;

function slotsSchema(layout: SlideTextLayoutId) {
  const shape: Record<string, z.ZodType> = {};
  for (const [name, slot] of Object.entries(slideSlotsOf(layout))) {
    const text = z
      .string()
      .refine((s) => visibleLength(s) > 0, 'darf nicht leer sein')
      .refine((s) => visibleLength(s) <= slot.maxChars, `höchstens ${slot.maxChars} Zeichen`);
    shape[name] = slot.required ? text : text.optional();
  }
  return z.strictObject(shape);
}

const slideSchemas = SLIDE_TEXT_LAYOUT_IDS.map((layout) =>
  z.object({
    layout: z.literal(layout),
    slots: slotsSchema(layout),
    notes: z.string().max(2000).optional(),
  })
);

// Grenzfall: die Optionen entstehen aus der Tabelle; Zod verlangt ein Tupel.
export const slideSpecSchema = z.discriminatedUnion(
  'layout',
  slideSchemas as unknown as [(typeof slideSchemas)[number], ...(typeof slideSchemas)[number][]]
);

export const slideDeckSpecSchema = z.object({
  title: z.string().trim().min(1).max(MAX_DECK_TITLE_CHARS),
  slides: z.array(slideSpecSchema).min(1).max(MAX_SLIDES),
});

export type SlideSpec = {
  [L in SlideTextLayoutId]: {
    layout: L;
    slots: { [K in keyof SlotsOf<L>]?: string };
    notes?: string | undefined;
  };
}[SlideTextLayoutId];

export type SlideDeckSpec = { title: string; slides: SlideSpec[] };

export interface ComposedSlidePage {
  id: string;
  configId: string;
  state: SlideLayoutState;
}

export interface ComposedSlideDeck {
  templateType: 'freeform' | 'freeform-at';
  pages: ComposedSlidePage[];
}

/** Ein Layout-Element samt seiner Id aus dem Zustand nehmen (Text, Form, Grafik …). */
function removeElement(state: SlideLayoutState, id: string): void {
  state.additionalTexts = state.additionalTexts.filter((e) => e.id !== id);
  state.shapeInstances = state.shapeInstances.filter((e) => e.id !== id);
  state.assetInstances = state.assetInstances.filter((e) => e.id !== id);
  state.layerOrder = state.layerOrder.filter((e) => e !== id);
  state.lockedLayerIds = state.lockedLayerIds.filter((e) => e !== id);
}

/**
 * Baut die Seiten des Foliensatzes. Ein weggelassenes optionales Feld nimmt
 * sein Element samt `layerOrder`-Eintrag mit — nichts bleibt als Platzhalter
 * („Unterüberschrift") auf der Folie stehen.
 */
export function composeSlideDeck(
  spec: SlideDeckSpec,
  options: { locale: BrandLocale; date: Date }
): ComposedSlideDeck {
  const templateType = slideLayoutConfigId(options.locale);
  const pages = spec.slides.map((slide, index): ComposedSlidePage => {
    const state = buildSlideLayout(slide.layout, {
      locale: options.locale,
      pageNumber: index + 1,
      date: options.date,
    });
    const def = SLIDE_TEXT_SLOTS[slide.layout];
    const given: Record<string, string | undefined> = slide.slots;
    for (const [name, slot] of Object.entries(slideSlotsOf(slide.layout))) {
      const value = given[name];
      if (value === undefined || value.trim() === '') {
        removeElement(state, slot.elementId);
        continue;
      }
      const target = state.additionalTexts.find((t) => t.id === slot.elementId);
      if (target) target.text = value.trim();
    }
    for (const id of def.removed) removeElement(state, id);

    const footerTitle = state.additionalTexts.find((t) => t.id === 'folie-titel');
    if (footerTitle) footerTitle.text = spec.title;
    state.notes = slide.notes?.trim() ?? '';
    return { id: `seed-${index}`, configId: templateType, state };
  });
  return { templateType, pages };
}
