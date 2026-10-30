import { describe, expect, it } from 'vitest';

import {
  SLIDE_LAYOUTS,
  SLIDE_TEXT_LAYOUT_IDS,
  SLIDE_TEXT_SLOTS,
  buildSlideLayout,
  composeSlideDeck,
  slideDeckSpecSchema,
  type SlideDeckSpec,
  type SlideSpec,
} from './index.js';

const DATE = new Date('2026-10-29T12:00:00Z');
const LOCALES = ['de-DE', 'de-AT'] as const;

/** Alle Slots eines Layouts mit erkennbaren Texten füllen. */
function fullSlide(layout: (typeof SLIDE_TEXT_LAYOUT_IDS)[number]): SlideSpec {
  const slots: Record<string, string> = {};
  for (const name of Object.keys(SLIDE_TEXT_SLOTS[layout].slots)) slots[name] = `T-${name}`;
  return { layout, slots, notes: `Notiz ${layout}` } as SlideSpec;
}

describe('slide text slots', () => {
  it('allow only text layouts', () => {
    const photo = /bild|diagramm/;
    for (const id of SLIDE_TEXT_LAYOUT_IDS) {
      expect(SLIDE_LAYOUTS.some((l) => l.id === id)).toBe(true);
      expect(photo.test(id)).toBe(false);
    }
  });

  for (const locale of LOCALES) {
    for (const layout of SLIDE_TEXT_LAYOUT_IDS) {
      it(`${layout} (${locale}): slot elements exist in the built layout`, () => {
        const built = buildSlideLayout(layout, { locale, pageNumber: 1, date: DATE });
        const ids = new Set(built.additionalTexts.map((t) => t.id));
        for (const slot of Object.values(SLIDE_TEXT_SLOTS[layout].slots)) {
          expect(ids.has(slot.elementId)).toBe(true);
        }
        const all = new Set([
          ...ids,
          ...built.shapeInstances.map((s) => s.id),
          ...built.assetInstances.map((a) => a.id),
        ]);
        for (const id of SLIDE_TEXT_SLOTS[layout].removed) expect(all.has(id)).toBe(true);
      });
    }
  }
});

describe('composeSlideDeck', () => {
  for (const locale of LOCALES) {
    it(`writes every slot into its element, numbers pages and sets the footer (${locale})`, () => {
      const spec: SlideDeckSpec = {
        title: 'Verkehrswende',
        slides: SLIDE_TEXT_LAYOUT_IDS.map(fullSlide),
      };
      const deck = composeSlideDeck(spec, { locale, date: DATE });
      expect(deck.templateType).toBe(locale === 'de-AT' ? 'freeform-at' : 'freeform');
      expect(deck.pages).toHaveLength(spec.slides.length);

      deck.pages.forEach((page, i) => {
        const slide = spec.slides[i]!;
        expect(page.configId).toBe(deck.templateType);
        const byId = new Map(page.state.additionalTexts.map((t) => [t.id, t]));
        for (const [name, slot] of Object.entries(SLIDE_TEXT_SLOTS[slide.layout].slots)) {
          expect(byId.get(slot.elementId)?.text).toBe(`T-${name}`);
        }
        expect(byId.get('folie-seitenzahl')?.text).toBe(String(i + 1));
        expect(byId.get('folie-titel')?.text).toBe('Verkehrswende');
        expect(page.state.notes).toBe(`Notiz ${slide.layout}`);
        const known = new Set([
          ...page.state.additionalTexts.map((t) => t.id),
          ...page.state.shapeInstances.map((s) => s.id),
          ...page.state.assetInstances.map((a) => a.id),
        ]);
        for (const id of page.state.layerOrder) expect(known.has(id)).toBe(true);
      });
    });
  }

  it('removes an omitted optional slot together with its layerOrder id', () => {
    const deck = composeSlideDeck(
      { title: 'X', slides: [{ layout: 'titel', slots: { headline: 'Hallo' } }] },
      { locale: 'de-DE', date: DATE }
    );
    const state = deck.pages[0]!.state;
    expect(state.additionalTexts.some((t) => t.id === 'folie-text')).toBe(false);
    expect(state.layerOrder).not.toContain('folie-text');
    expect(state.layerOrder).toContain('folie-headline');
  });

  it('drops the Störer placeholder of the text slide', () => {
    const deck = composeSlideDeck(
      { title: 'X', slides: [{ layout: 'textfolie', slots: { headline: 'A', spalte1: 'B' } }] },
      { locale: 'de-AT', date: DATE }
    );
    const state = deck.pages[0]!.state;
    expect(state.layerOrder).not.toContain('folie-stoerer');
    expect(state.layerOrder).not.toContain('folie-stoerer-text');
    expect(state.shapeInstances.some((s) => s.id === 'folie-stoerer')).toBe(false);
    expect(state.layerOrder).not.toContain('folie-spalte-2');
  });
});

describe('slideDeckSpecSchema', () => {
  const ok = { title: 'T', slides: [{ layout: 'zitat', slots: { zitat: 'Ein Satz.' } }] };

  it('accepts a valid deck', () => {
    expect(slideDeckSpecSchema.safeParse(ok).success).toBe(true);
  });

  it('rejects an unknown or photo layout', () => {
    for (const layout of ['gibtsnicht', 'text-bild', 'diagramm']) {
      const r = slideDeckSpecSchema.safeParse({ ...ok, slides: [{ layout, slots: {} }] });
      expect(r.success).toBe(false);
    }
  });

  it('rejects an over-budget slot and an empty required slot', () => {
    const max = SLIDE_TEXT_SLOTS.zitat.slots.zitat.maxChars;
    const long = slideDeckSpecSchema.safeParse({
      ...ok,
      slides: [{ layout: 'zitat', slots: { zitat: 'x'.repeat(max + 1) } }],
    });
    expect(long.success).toBe(false);
    const empty = slideDeckSpecSchema.safeParse({
      ...ok,
      slides: [{ layout: 'zitat', slots: { zitat: '  ' } }],
    });
    expect(empty.success).toBe(false);
  });

  it('turns a literal \\n from a double-escaped model answer into a line break', () => {
    const r = slideDeckSpecSchema.safeParse({
      title: 'T',
      slides: [{ layout: 'textfolie', slots: { headline: 'H', spalte1: '• Eins\\n• Zwei' } }],
    });
    expect(r.success && r.data.slides[0]!.slots).toEqual({
      headline: 'H',
      spalte1: '• Eins\n• Zwei',
    });
  });

  it('rejects unknown slots, a missing required slot and too many slides', () => {
    expect(
      slideDeckSpecSchema.safeParse({
        ...ok,
        slides: [{ layout: 'zitat', slots: { zitat: 'a', foo: 'b' } }],
      }).success
    ).toBe(false);
    expect(
      slideDeckSpecSchema.safeParse({ ...ok, slides: [{ layout: 'zitat', slots: {} }] }).success
    ).toBe(false);
    expect(
      slideDeckSpecSchema.safeParse({
        title: 'T',
        slides: Array.from({ length: 31 }, () => ok.slides[0]),
      }).success
    ).toBe(false);
  });
});
