import { describe, expect, it } from 'vitest';

import {
  composeSlideDeck,
  DECK_STILE,
  FOLIEN_TYPEN,
  FOLIEN_TYP_IDS,
  folienSlotsOf,
  readDeckStil,
  readFolie,
  type DeckSpec,
  type FolieSpec,
  type FolienTypId,
  buildSlideLayout,
  removeElement,
  type SlideLayoutId,
} from './index.js';

const DATE = new Date('2026-10-29T12:00:00Z');
const LOCALES = ['de-DE', 'de-AT'] as const;

function fullFolie(typ: FolienTypId): FolieSpec {
  const slots: Record<string, string | string[]> = {};
  for (const [name, slot] of Object.entries(folienSlotsOf(typ))) {
    slots[name] =
      slot.kind === 'text'
        ? name === 'text' && typ === 'text'
          ? 'Ein ==wichtiger== Absatz.'
          : `T-${name}`
        : Array.from({ length: slot.maxItems }, (_, i) => `P-${name}-${i + 1}`);
  }
  return { typ, slots, notes: `Notiz ${typ}` } as FolieSpec;
}

describe('composeSlideDeck in a style', () => {
  for (const locale of LOCALES) {
    for (const { id: stil } of DECK_STILE) {
      it(`compose then readFolie returns the spec for every typ (${stil}, ${locale})`, () => {
        const spec: DeckSpec = { title: 'Verkehrswende', slides: FOLIEN_TYP_IDS.map(fullFolie) };
        const deck = composeSlideDeck(spec, { locale, date: DATE, stil });
        expect(deck.templateType).toBe(locale === 'de-AT' ? 'freeform-at' : 'freeform');
        expect(deck.overflow).toEqual([]);
        deck.pages.forEach((page, i) => {
          expect(page.state.deckStil).toBe(stil);
          expect(readFolie(page.state as unknown as Record<string, unknown>)).toEqual(
            spec.slides[i]
          );
        });
        expect(
          readDeckStil(
            deck.pages.map((p) => ({ state: p.state as unknown as Record<string, unknown> }))
          )
        ).toBe(stil);
      });
    }
  }

  it('lists overflow with slide number and element id when a measure says nothing fits', () => {
    const spec: DeckSpec = { title: 'X', slides: [fullFolie('zitat'), fullFolie('text')] };
    const deck = composeSlideDeck(spec, {
      locale: 'de-DE',
      date: DATE,
      stil: 'cd',
      measure: () => ({ height: 100000 }),
    });
    expect(deck.overflow).toContain('1:folie-zitat');
    expect(deck.overflow).toContain('2:folie-spalte-1');
  });

  it('reads a C/D-era textfolie page as typ text and its stil as cd', () => {
    // Seiten aus der Zeit vor den Stilen: Layout-Bauer, Texte von Hand gesetzt.
    const page = (layout: SlideLayoutId, texts: Record<string, string>, drop: string[] = []) => {
      const built = buildSlideLayout(layout, { locale: 'de-DE', pageNumber: 1, date: DATE });
      for (const [id, text] of Object.entries(texts)) {
        const el = built.additionalTexts.find((e) => e.id === id)!;
        el.text = text;
      }
      for (const id of drop) removeElement(built, id);
      return built as unknown as Record<string, unknown>;
    };
    const states = [
      page('textfolie', {
        'folie-headline': 'Warum',
        'folie-spalte-1': 'Links',
        'folie-spalte-2': 'Rechts',
      }),
      page('textfolie', { 'folie-headline': 'Nur', 'folie-spalte-1': 'Eine' }, ['folie-spalte-2']),
      page('titel', { 'folie-headline': 'Hallo' }),
      page('zitat', { 'folie-zitat': 'Satz' }),
      page('danke', {}),
    ];
    expect(readFolie(states[0]!)).toMatchObject({
      typ: 'text',
      slots: { headline: 'Warum', text: 'Links\nRechts' },
    });
    expect(readFolie(states[1]!)).toMatchObject({ typ: 'text', slots: { text: 'Eine' } });
    expect(readFolie(states[2]!)?.typ).toBe('titel');
    expect(readFolie(states[3]!)?.typ).toBe('zitat');
    expect(readFolie(states[4]!)?.typ).toBe('danke');
    expect(readDeckStil(states.map((state) => ({ state })))).toBe('cd');
  });

  it('reads the most frequent deck style, ties to the earliest page', () => {
    const of = (...stile: Array<string | null>) =>
      readDeckStil(stile.map((s) => ({ state: s ? { deckStil: s } : {} })));
    expect(of('band', 'cd', 'cd')).toBe('cd');
    expect(of('cd', 'cd', 'band')).toBe('cd');
    expect(of('band', 'cd')).toBe('band');
    expect(of(null, 'kacheln', 'ruhig', 'ruhig')).toBe('ruhig');
    expect(of(null, 'bogus')).toBe('cd');
  });

  it('keeps every typ listed in FOLIEN_TYPEN recognisable', () => {
    expect(FOLIEN_TYP_IDS).toEqual(Object.keys(FOLIEN_TYPEN));
  });

  describe('readFolie list items', () => {
    it('skips list items that are empty after trimming', () => {
      const state = {
        additionalTexts: [
          { id: 'folie-headline', text: 'Titel' },
          { id: 'folie-punkt-1', text: '• Eins' },
          { id: 'folie-punkt-2', text: '•  ' },
          { id: 'folie-punkt-3', text: '  ' },
          { id: 'folie-punkt-4', text: '• Vier' },
        ],
      };
      expect(readFolie(state)).toMatchObject({ typ: 'liste', slots: { punkte: ['Eins', 'Vier'] } });
    });
  });
});
