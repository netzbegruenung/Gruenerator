import { describe, expect, it } from 'vitest';

import { deckPages, deckSpec, readSharepicSource } from './sharepicSource';

const DECK = '6f1c2f0e-4b1a-4a55-9d0e-0c1f3c2a7b11';
const slide = (text: string) => ({
  locale: 'de-DE',
  slides: [
    {
      background: { kind: 'farbe', color: 'tanne' },
      position: 'mitte',
      align: 'links',
      logo: false,
      items: [{ type: 'text', text }],
    },
  ],
});
const baseline = {
  elements: {},
  background: { color: null, imageSrc: null, offset: null, scale: null },
};
const source = (text: string, deck = DECK) => ({
  v: 1,
  deck,
  slide: slide(text),
  attribution: null,
  baseline,
});
const page = (id: string, src: unknown, configId = 'freeform') => ({
  id,
  configId,
  state: { sharepicSource: src },
});

describe('readSharepicSource', () => {
  it('parses a valid source', () => {
    const r = readSharepicSource(page('a', source('Hi')));
    expect(r?.deck).toBe(DECK);
    expect(r?.slide.slides).toHaveLength(1);
  });

  it('accepts freeform-at', () => {
    expect(readSharepicSource(page('a', source('Hi'), 'freeform-at'))).not.toBeNull();
  });

  it('returns null for missing, malformed, unknown v and wrong configId', () => {
    expect(readSharepicSource({ configId: 'freeform', state: {} })).toBeNull();
    expect(readSharepicSource(page('a', 'junk'))).toBeNull();
    expect(readSharepicSource(page('a', { ...source('Hi'), v: 2 }))).toBeNull();
    expect(readSharepicSource(page('a', source('Hi'), 'quote'))).toBeNull();
  });

  it('rejects a multi-slide spec', () => {
    const two = {
      ...source('x'),
      slide: { ...slide('x'), slides: [...slide('x').slides, ...slide('y').slides] },
    };
    expect(readSharepicSource(page('a', two))).toBeNull();
  });
});

describe('deckSpec / deckPages', () => {
  it('concatenates slides in page order and skips other decks', () => {
    const pages = [
      page('a', source('A')),
      page('x', source('X', '11111111-1111-4111-8111-111111111111')),
      page('b', source('B')),
    ];
    expect(deckPages(pages, DECK).map((m) => m.page.id)).toEqual(['a', 'b']);
    const spec = deckSpec(pages, DECK);
    expect(spec?.slides.map((s) => (s.items[0] as { text: string }).text)).toEqual(['A', 'B']);
    expect(spec?.locale).toBe('de-DE');
  });

  it('handles a duplicated page (same source twice)', () => {
    const pages = [page('a', source('A')), page('a2', source('A'))];
    expect(deckSpec(pages, DECK)?.slides).toHaveLength(2);
  });

  it('returns null for an unknown deck', () => {
    expect(deckSpec([page('a', source('A'))], '22222222-2222-4222-8222-222222222222')).toBeNull();
  });
});
