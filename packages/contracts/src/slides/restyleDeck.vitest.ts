import { describe, expect, it } from 'vitest';

import {
  composeSlideDeck,
  FOLIEN_TYP_IDS,
  folienSlotsOf,
  readDeckStil,
  readFolie,
  restyleDeck,
  type DeckPage,
  type DeckSpec,
  type FolieSpec,
  type FolienTypId,
} from './index.js';

const DATE = new Date('2026-10-30T12:00:00Z');

function fullFolie(typ: FolienTypId): FolieSpec {
  const slots: Record<string, string | string[]> = {};
  for (const [name, slot] of Object.entries(folienSlotsOf(typ))) {
    slots[name] =
      slot.kind === 'text'
        ? `T-${name}`
        : Array.from({ length: slot.maxItems }, (_, i) => `P-${name}-${i + 1}`);
  }
  return { typ, slots } as FolieSpec;
}

function pagesOf(stil: 'cd' | 'ruhig' | 'band' = 'ruhig'): DeckPage[] {
  const spec: DeckSpec = { title: 'Plan', slides: FOLIEN_TYP_IDS.map(fullFolie) };
  return composeSlideDeck(spec, { locale: 'de-DE', date: DATE, stil }).pages.map((p) => ({
    id: `page-${p.id}`,
    configId: p.configId,
    state: p.state as unknown as Record<string, unknown>,
  }));
}

const ctx = { locale: 'de-DE' as const, date: DATE, title: 'Plan' };
type El = { id: string; text: string };
const texts = (p: DeckPage) => p.state['additionalTexts'] as El[];

describe('restyleDeck', () => {
  it('restyle keeps page ids, edited texts and user elements', () => {
    const pages = pagesOf('ruhig');
    const text = pages[2]!;
    const edited = texts(text).map((t) =>
      t.id === 'folie-headline' ? { ...t, text: 'Von Hand geändert' } : t
    );
    text.state = {
      ...text.state,
      additionalTexts: edited,
      userImageInstances: [{ id: 'img-1', x: 10, y: 10 }],
      layerOrder: [...(text.state['layerOrder'] as string[]), 'img-1'],
    };

    const out = restyleDeck(pages, 'band', ctx);

    expect(out.map((p) => p.id)).toEqual(pages.map((p) => p.id));
    expect(out.every((p) => p.state['deckStil'] === 'band')).toBe(true);
    expect(readDeckStil(out)).toBe('band');
    expect(texts(out[2]!).find((t) => t.id === 'folie-headline')?.text).toBe('Von Hand geändert');
    const images = out[2]!.state['userImageInstances'] as Array<{ id: string }>;
    expect(images[0]!.id).toBe('img-1');
    expect(out[2]!.state['layerOrder']).toContain('img-1');
    // jede Folie behält ihren Typ und ihre Texte
    out.forEach((p, i) => {
      const before = readFolie(pages[i]!.state);
      expect(readFolie(p.state)).toEqual(
        i === 2 ? { ...before, slots: { ...before!.slots, headline: 'Von Hand geändert' } } : before
      );
    });
  });

  it('restyle leaves an unrecognised page untouched', () => {
    const odd: DeckPage = {
      id: 'odd',
      configId: 'freeform',
      state: { additionalTexts: [{ id: 'mein-text', text: 'x' }], layerOrder: ['mein-text'] },
    };
    const [out] = restyleDeck([odd], 'band', ctx);
    expect(out).toBe(odd);
  });
});
