import { type SharepicSlide, type SharepicSpec } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { driftProblems, restoreDroppedFields, specEditDrift } from './specEditGuard.js';

const base = {
  background: { kind: 'farbe', color: 'mint' },
  position: 'mitte',
  align: 'links',
  logo: true,
} as const;

const quote: SharepicSlide = {
  ...base,
  items: [
    {
      type: 'zitat',
      text: 'Klimaschutz ist Gerechtigkeit',
      name: 'Anna Beispiel',
      funktion: 'Landtagsabgeordnete',
    },
  ],
};
const deck = (...slides: SharepicSlide[]): SharepicSpec => ({ locale: 'de-DE', slides });

describe('specEditDrift', () => {
  it('flags a quote that lost its speaker function on a headline edit (#4252)', () => {
    const next = deck({
      ...quote,
      items: [{ type: 'zitat', text: 'Klimaschutz = Gerechtigkeit', name: 'Anna Beispiel' }],
    });
    const drifts = specEditDrift(deck(quote), next, 'Mach die Headline kürzer und knackiger');
    expect(drifts).toEqual([
      { kind: 'field', slide: 0, item: 0, field: 'funktion', value: 'Landtagsabgeordnete' },
    ]);
    expect(driftProblems(drifts, deck(quote))).toContain('funktion „Landtagsabgeordnete“');
  });

  it('lets the request remove a field it names', () => {
    const next = deck({
      ...quote,
      items: [{ type: 'zitat', text: 'Klimaschutz ist Gerechtigkeit', name: 'Anna Beispiel' }],
    });
    expect(specEditDrift(deck(quote), next, 'Entferne die Funktion der Autorin')).toEqual([]);
  });

  it('flags a headline slide that became a list (#4252, b3)', () => {
    const headline: SharepicSlide = {
      ...base,
      items: [
        { type: 'dachzeile', text: 'Mobilität' },
        { type: 'headline', lines: ['Mehr Bus und Bahn', 'auf dem Land'] },
      ],
    };
    const list: SharepicSlide = {
      ...base,
      items: [
        { type: 'dachzeile', text: 'Mobilität' },
        { type: 'liste', items: ['Mobilität für alle Menschen', 'Bus und Bahn'] },
      ],
    };
    const drifts = specEditDrift(
      deck(headline, quote, quote),
      deck(list, quote, quote),
      'Mach die Headline kürzer und knackiger'
    );
    expect(drifts.map((d) => d.kind)).toEqual(['type']);
    expect(driftProblems(drifts, deck(headline, quote, quote))).toContain(
      'Folie 1: Element 2 ist ein headline und bleibt ein headline (nicht liste)'
    );
  });

  it('flags a split-off item and a changed slide count', () => {
    const one: SharepicSlide = { ...base, items: [{ type: 'headline', lines: ['A', 'B'] }] };
    const two: SharepicSlide = {
      ...base,
      items: [
        { type: 'headline', lines: ['A'] },
        { type: 'text', text: 'B' },
      ],
    };
    expect(specEditDrift(deck(one), deck(two), 'kürzer').map((d) => d.kind)).toEqual(['items']);
    expect(specEditDrift(deck(one, one), deck(one), 'kürzer').map((d) => d.kind)).toEqual([
      'slides',
    ]);
    expect(specEditDrift(deck(one), deck(one, one), 'Füg eine Fazit-Folie hinzu')).toEqual([]);
  });

  it('compares only the focused slide of a carousel', () => {
    const plain: SharepicSlide = { ...base, items: [quote.items[0]!] };
    const dropped: SharepicSlide = {
      ...base,
      items: [{ type: 'zitat', text: 'Klimaschutz ist Gerechtigkeit', name: 'Anna Beispiel' }],
    };
    expect(specEditDrift(deck(plain, plain), deck(plain, dropped), 'kürzer', { slide: 0 })).toEqual(
      []
    );
    expect(specEditDrift(deck(plain, plain), deck(plain, dropped), 'kürzer')).toHaveLength(1);
  });

  it('lets an accent go with the line it marked', () => {
    const from: SharepicSlide = {
      ...base,
      items: [{ type: 'headline', lines: ['A', 'B', 'C'], akzent: 2 }],
    };
    const shorter: SharepicSlide = { ...base, items: [{ type: 'headline', lines: ['A', 'B'] }] };
    const same: SharepicSlide = {
      ...base,
      items: [{ type: 'headline', lines: ['X', 'Y', 'Z'] }],
    };
    expect(specEditDrift(deck(from), deck(shorter), 'kürzer')).toEqual([]);
    expect(specEditDrift(deck(from), deck(same), 'kürzer').map((d) => d.kind)).toEqual(['field']);
  });

  it('flags dropped slide fields', () => {
    const sourced: SharepicSlide = { ...quote, quelle: 'Umweltbundesamt 2025' };
    expect(specEditDrift(deck(sourced), deck(quote), 'Hintergrund Tanne')).toEqual([
      { kind: 'field', slide: 0, item: null, field: 'quelle', value: 'Umweltbundesamt 2025' },
    ]);
    expect(specEditDrift(deck(sourced), deck(quote), 'Entferne die Quellenangabe')).toEqual([]);
  });
});

describe('restoreDroppedFields', () => {
  it('puts dropped fields back and says so', () => {
    const sourced: SharepicSlide = { ...quote, quelle: 'Umweltbundesamt 2025' };
    const next = deck({
      ...base,
      items: [{ type: 'zitat', text: 'Klimaschutz = Gerechtigkeit', name: 'Anna Beispiel' }],
    });
    const drifts = specEditDrift(deck(sourced), next, 'kürzer');
    const { spec, hinweis } = restoreDroppedFields(next, drifts);
    expect(spec.slides[0]!.quelle).toBe('Umweltbundesamt 2025');
    expect(spec.slides[0]!.items[0]).toMatchObject({
      text: 'Klimaschutz = Gerechtigkeit',
      funktion: 'Landtagsabgeordnete',
    });
    expect(hinweis).toContain('Funktion „Landtagsabgeordnete“');
  });
});
