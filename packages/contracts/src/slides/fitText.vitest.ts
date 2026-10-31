import { describe, expect, it } from 'vitest';

import { type BrandLocale } from '../brand/grueneBrand.js';

import { buildFolie, DECK_STILE, deckStilBoxes, type DeckStilCtx } from './deckStile/index.js';
import { fitSlideTexts, type MeasureText } from './fitText.js';
import { type FolieSpec } from './folienTypen.js';

/** Fake: Zeilen = ⌈Zeichen × 0,5 × Größe / Breite⌉, Höhe = Zeilen × Größe × Zeilenabstand. */
const measure: MeasureText = (text, font, width) => {
  const lines = Math.max(1, Math.ceil((text.length * 0.5 * font.size) / width));
  return { height: lines * font.size * font.lineHeight };
};

const ctx = (locale: BrandLocale): DeckStilCtx => ({
  locale,
  date: new Date('2026-10-30T12:00:00Z'),
  pageNumber: 2,
  title: 'Deck',
  index: 1,
});

const titel = (headline: string): FolieSpec => ({ typ: 'titel', slots: { headline } });
const size = (state: { additionalTexts: Array<{ id: string; fontSize: number }> }, id: string) =>
  state.additionalTexts.find((t) => t.id === id)!.fontSize;

describe('fitSlideTexts', () => {
  it('shrinks a two-line title headline until it fits its box', () => {
    const state = buildFolie('cd', titel('Mehr Radwege'), ctx('de-DE'));
    const before = size(state, 'folie-headline');
    expect(measure('Mehr Radwege', { family: 'x', size: before, lineHeight: 1 }, 1700).height).toBe(
      2 * before
    );

    const out = fitSlideTexts(
      state,
      { 'folie-headline': { maxHeight: 320, minScale: 0.6 } },
      measure
    );

    expect(out.overflow).toEqual([]);
    expect(size(out.state, 'folie-headline')).toBeLessThan(before);
    expect(size(out.state, 'folie-headline')).toBeGreaterThanOrEqual(Math.round(before * 0.6));
    // Der Eingang bleibt unverändert.
    expect(size(state, 'folie-headline')).toBe(before);
  });

  it('reports overflow below minScale instead of overlapping', () => {
    const state = buildFolie('cd', titel('Klimaschutzsofortprogramm'.repeat(3)), ctx('de-DE'));
    const before = size(state, 'folie-headline');

    const out = fitSlideTexts(
      state,
      { 'folie-headline': { maxHeight: 320, minScale: 0.6 } },
      measure
    );

    expect(out.overflow).toEqual(['folie-headline']);
    expect(size(out.state, 'folie-headline')).toBe(Math.round(before * 0.6));
  });

  it('leaves fitting text untouched', () => {
    const state = buildFolie('cd', titel('Mehr Radwege'), ctx('de-DE'));

    const out = fitSlideTexts(
      state,
      { 'folie-headline': { maxHeight: 900, minScale: 0.6 } },
      measure
    );

    expect(out.overflow).toEqual([]);
    expect(out.state).toEqual(state);
  });

  it('fits a 6-punkte list in every stil as one group', () => {
    const long =
      'Ein langer Punkt über die Verkehrswende in unserer Stadt und im Umland ganz'.slice(0, 70);
    const items = [long, 'Kurz', 'Radwege', 'Busse und Bahnen', long, 'Fußwege'];
    const folie: FolieSpec = { typ: 'liste', slots: { headline: 'Verkehr', punkte: items } };
    for (const stil of DECK_STILE.map((s) => s.id)) {
      for (const locale of ['de-DE', 'de-AT'] as const) {
        const state = buildFolie(stil, folie, ctx(locale));
        const original = size(state, 'folie-punkt-1');
        const out = fitSlideTexts(state, deckStilBoxes(stil, 'liste'), measure);

        expect(out.overflow, `${stil} ${locale}`).toEqual([]);
        const sizes = new Set(
          out.state.additionalTexts
            .filter((t) => /^folie-punkt-\d+$/.test(t.id))
            .map((t) => t.fontSize)
        );
        expect(sizes.size, `${stil} ${locale} one shared size`).toBe(1);
        expect([...sizes][0]!).toBeLessThanOrEqual(original);
      }
    }
  });

  it('reports a list overflow below minScale', () => {
    const folie: FolieSpec = {
      typ: 'liste',
      slots: { headline: 'Verkehr', punkte: ['Kurz', 'x'.repeat(400), 'Auch kurz'] },
    };
    const state = buildFolie('cd', folie, ctx('de-DE'));
    const boxes = deckStilBoxes('cd', 'liste');

    const out = fitSlideTexts(state, boxes, measure);

    expect(out.overflow).toEqual(['folie-punkt-2']);
    // Alle Punkte stehen trotzdem auf demselben, kleinsten Maßstab.
    const min = Math.round(size(state, 'folie-punkt-1') * boxes['folie-punkt-*']!.minScale);
    expect(size(out.state, 'folie-punkt-1')).toBe(min);
    expect(size(out.state, 'folie-punkt-3')).toBe(min);
  });
});
