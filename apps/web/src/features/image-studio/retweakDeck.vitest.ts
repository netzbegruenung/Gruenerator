import { readSharepicSource } from '@gruenerator/canvas-editor/composer';
import { type SharepicSpec } from '@gruenerator/contracts';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@gruenerator/canvas-editor/composer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@gruenerator/canvas-editor/composer')>();
  return { ...actual, ensureFontsReady: vi.fn(async () => {}) };
});
vi.mock('./freitext/photoTone', () => ({
  primePhotoTones: vi.fn(async () => {}),
  cachedPhotoTone: vi.fn(() => null),
}));

import { canvasSeed, composeCreatorSharepic, creatorPhotoSrc } from './freitext/composeForRender';
import { deckTweaks, type RetweakCompose, retweakDeck } from './retweakDeck';

import type { DesignPage } from '@gruenerator/canvas-editor';

const slide = (headline: string, text: string): SharepicSpec['slides'][number] => ({
  background: { kind: 'farbe', color: 'tanne' },
  position: 'mitte',
  align: 'links',
  items: [
    { type: 'headline', lines: [headline] },
    { type: 'text', text },
  ],
  logo: false,
});

const CAROUSEL: SharepicSpec = {
  locale: 'de-DE',
  format: 'post-portrait-tall',
  slides: [
    slide('Klimaschutz jetzt', 'Wir sanieren jede Schule bis 2030.'),
    slide('Busse fahren öfter', 'Im Takt von zehn Minuten, auch am Abend.'),
    slide('Radwege bauen', 'Breit, sicher und durchgehend vernetzt.'),
  ],
};

async function minted(spec = CAROUSEL): Promise<DesignPage[]> {
  const credits = spec.slides.map(() => null);
  const composed = await composeCreatorSharepic(spec, credits);
  const seed = canvasSeed(composed, { base: spec, tweaks: {}, attributions: credits });
  return structuredClone(seed.initialState.pages) as DesignPage[];
}

const compose: RetweakCompose = (spec, credits, { ownPhoto, kiLabel }) =>
  composeCreatorSharepic(spec, credits, (f) => ownPhoto(f) ?? creatorPhotoSrc(f), kiLabel);

type Item = { id: string; text?: string };
const items = (state: Record<string, unknown>, key: string) =>
  Array.isArray(state[key]) ? (state[key] as Item[]) : [];
/** Every element id on a page. */
const ids = (state: Record<string, unknown>) => [
  ...items(state, 'additionalTexts').map((t) => t.id),
  ...items(state, 'shapeInstances').map((s) => s.id),
  ...items(state, 'assetInstances').map((a) => a.id),
  ...((state.selectedIcons as string[] | undefined) ?? []),
];
const textOf = (state: Record<string, unknown>, id: string) =>
  items(state, 'additionalTexts').find((t) => t.id === id)?.text;
const deckOf = (pages: DesignPage[]) => readSharepicSource(pages[0]!)!.deck;

/** The pages after `ops`, as the editor's `replaceDeck` would leave them. */
function applied(
  pages: DesignPage[],
  ops: { updates: { pageId: string; state: Record<string, unknown> }[] }
) {
  return pages.map((p) => ({
    ...p,
    state: ops.updates.find((u) => u.pageId === p.id)?.state ?? p.state,
  }));
}

describe('deckTweaks', () => {
  it('offers the navigation of a carousel, none for a single sharepic', async () => {
    const deck = await minted();
    expect(deckTweaks(deck, deckOf(deck)).map((t) => t.id)).toContain('navigation');

    const single = await minted({ ...CAROUSEL, slides: [CAROUSEL.slides[0]!] });
    expect(deckTweaks(single, deckOf(single)).map((t) => t.id)).not.toContain('navigation');
  });

  it('knows no options for a deck that is not there', async () => {
    expect(deckTweaks(await minted(), '00000000-0000-4000-8000-000000000000')).toEqual([]);
  });
});

describe('retweakDeck', () => {
  it('puts the page number on every slide and keeps the choice on the pages', async () => {
    const pages = await minted();
    const result = await retweakDeck(
      () => pages,
      deckOf(pages),
      { navigation: 'pfeil-bruch' },
      compose
    );
    const next = applied(pages, result!.ops);

    expect(next.map((p) => textOf(p.state, 'sc-seite'))).toEqual(['1/3', '2/3', '3/3']);
    expect(readSharepicSource(next[1]!)!.tweaks).toEqual({ navigation: 'pfeil-bruch' });
    // The options read the stored choice back.
    const nav = deckTweaks(next, deckOf(next)).find((t) => t.id === 'navigation')!;
    expect(nav.value).toBe('pfeil-bruch');
  });

  it('takes the arrow off again with „Keine"', async () => {
    const pages = await minted();
    expect(ids(pages[0]!.state)).toContain('sc-pfeil');
    const result = await retweakDeck(() => pages, deckOf(pages), { navigation: 'keine' }, compose);
    const next = applied(pages, result!.ops);
    for (const page of next) {
      expect(ids(page.state)).not.toContain('sc-pfeil');
      expect(ids(page.state)).not.toContain('sc-seite');
    }
  });

  it('keeps a text the person typed', async () => {
    const pages = await minted();
    const body = items(pages[1]!.state, 'additionalTexts').find((t) => t.id === 'sc-1-text')!;
    body.text = 'Alle zehn Minuten, auch sonntags.';
    const result = await retweakDeck(
      () => pages,
      deckOf(pages),
      { navigation: 'pfeil-punkte' },
      compose
    );
    const next = applied(pages, result!.ops);
    expect(textOf(next[1]!.state, 'sc-1-text')).toBe('Alle zehn Minuten, auch sonntags.');
    expect(result!.dropped).toBe(0);
  });

  it('lifts again when a hand edit lands while composing', async () => {
    let pages = await minted();
    const spy = vi.fn(compose);
    let first = true;
    const racing: RetweakCompose = async (...args) => {
      const out = await spy(...args);
      if (first) {
        first = false;
        pages = structuredClone(pages);
        items(pages[0]!.state, 'additionalTexts').find((t) => t.id === 'sc-1-text')!.text =
          'Während des Setzens getippt.';
      }
      return out;
    };
    const result = await retweakDeck(() => pages, deckOf(pages), { navigation: 'bruch' }, racing);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(textOf(applied(pages, result!.ops)[0]!.state, 'sc-1-text')).toBe(
      'Während des Setzens getippt.'
    );
  });

  it('returns null for a deck that is gone', async () => {
    const result = await retweakDeck(() => [], 'x', { navigation: 'keine' }, compose);
    expect(result).toBeNull();
  });
});
