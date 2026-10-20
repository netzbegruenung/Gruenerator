import { type MarketplaceItem, type MarketplaceSection } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { getSystemAgent } from '../agents/system';
import { hasSystemRecipe } from '../agents/skills/index';

import { DEFAULT_MARKETPLACE_FILTERS } from './filters';
import { isSampleItem } from './sampleCollection';
import {
  MARKETPLACE_COLLECTIONS,
  MARKETPLACE_FEATURES,
  collectionById,
  composeCollection,
  composeFrontpage,
  fallbackFeature,
  featureById,
  featureFor,
  isFrontpageView,
  landesverbandShelf,
  newestShelf,
  popularShelf,
  visualShelf,
  hasPreview,
} from './frontpage';

function it_(
  kind: MarketplaceItem['kind'],
  ref: string,
  over: Partial<{ createdAt: string; likesCount: number; origin: MarketplaceItem['origin'] }> = {}
): MarketplaceItem {
  return {
    kind,
    ref,
    key: `${kind}:${ref}`,
    origin: over.origin ?? 'offiziell',
    title: ref,
    createdAt: over.createdAt ?? '2026-10-01T00:00:00.000Z',
    likesCount: over.likesCount ?? 0,
    thumbnailUrl: `/${ref}.webp`,
    ...((kind === 'sticker' || kind === 'background') && {
      asset: { thumbUrl: `/${ref}.webp`, src: `/${ref}.png` },
    }),
  } as MarketplaceItem;
}

const section = (kind: MarketplaceItem['kind'], items: MarketplaceItem[]): MarketplaceSection => ({
  kind,
  items,
  hasMore: false,
});

const refs = (items: MarketplaceItem[]) => items.map((i) => i.ref);

describe('isFrontpageView', () => {
  it('is the unfiltered „Start" tab only', () => {
    expect(isFrontpageView(DEFAULT_MARKETPLACE_FILTERS)).toBe(true);
    expect(isFrontpageView({ ...DEFAULT_MARKETPLACE_FILTERS, q: '  ' })).toBe(true);
    expect(isFrontpageView({ ...DEFAULT_MARKETPLACE_FILTERS, q: 'presse' })).toBe(false);
    expect(isFrontpageView({ ...DEFAULT_MARKETPLACE_FILTERS, collection: 'canva' })).toBe(false);
    expect(isFrontpageView({ ...DEFAULT_MARKETPLACE_FILTERS, origin: 'offiziell' })).toBe(false);
    expect(isFrontpageView({ ...DEFAULT_MARKETPLACE_FILTERS, sort: 'neu' })).toBe(false);
    expect(isFrontpageView({ ...DEFAULT_MARKETPLACE_FILTERS, tab: 'agents' })).toBe(false);
    expect(
      isFrontpageView({ ...DEFAULT_MARKETPLACE_FILTERS, item: { kind: 'agent', ref: 'a' } })
    ).toBe(false);
  });
});

describe('featureFor', () => {
  it('finds a slot for both audiences', () => {
    expect(featureFor('de-DE')?.id).toBe('leichte-sprache');
    expect(featureFor('de-AT')?.id).toBe('leichte-sprache');
    expect(featureFor(null)?.id).toBe('leichte-sprache');
  });
});

describe('shelves', () => {
  it('Landesverband: up to three, hidden below two', () => {
    const many = [
      section('agent', [it_('agent', 'a1'), it_('agent', 'a2')]),
      section('recipe', [it_('recipe', 'r1'), it_('recipe', 'r2')]),
    ];
    expect(refs(landesverbandShelf(many))).toEqual(['a1', 'a2', 'r1']);
    expect(landesverbandShelf([section('agent', [it_('agent', 'a1')])])).toEqual([]);
  });

  it('Neu: newest first across kinds', () => {
    const shelf = newestShelf([
      section('agent', [it_('agent', 'old', { createdAt: '2026-01-01' })]),
      section('recipe', [it_('recipe', 'new', { createdAt: '2026-10-01' })]),
    ]);
    expect(refs(shelf)).toEqual(['new', 'old']);
  });

  it('Beliebt: only liked items, hidden until five of them', () => {
    const liked = [1, 2, 3, 4, 5, 6].map((n) => it_('agent', `a${n}`, { likesCount: n }));
    expect(refs(popularShelf([section('agent', liked)]))).toEqual(['a6', 'a5', 'a4', 'a3', 'a2']);
    const thin = [...liked.slice(0, 4), it_('agent', 'unliked')];
    expect(popularShelf([section('agent', thin)])).toEqual([]);
  });

  it('drops the focused item before cutting a shelf to size', () => {
    const liked = [9, 5, 4, 3, 2, 1].map((n) => it_('agent', `a${n}`, { likesCount: n }));
    const shelf = popularShelf([section('agent', liked)], 'agent:a9');
    expect(refs(shelf)).toEqual(['a5', 'a4', 'a3', 'a2', 'a1']);
  });

  it('Zum Gestalten: kinds take turns, hidden below three', () => {
    const shelf = visualShelf([
      section('template', [it_('template', 't1'), it_('template', 't2'), it_('template', 't3')]),
      section('sticker', [it_('sticker', 's1')]),
    ]);
    expect(refs(shelf)).toEqual(['t1', 's1', 't2', 't3']);
    expect(visualShelf([section('sticker', [it_('sticker', 's1'), it_('sticker', 's2')])])).toEqual(
      []
    );
  });

  it('falls back to the newest official item for „Im Fokus"', () => {
    const pick = fallbackFeature([
      section('agent', [
        it_('agent', 'public', { origin: 'oeffentlich', createdAt: '2026-12-01' }),
        it_('agent', 'official', { createdAt: '2026-09-01' }),
      ]),
    ]);
    expect(pick?.ref).toBe('official');
    expect(fallbackFeature([])).toBeNull();
  });
});

describe('composeFrontpage', () => {
  const official = it_('agent', 'official', { createdAt: '2026-09-01' });
  const liked = [1, 2, 3, 4, 5].map((n) => it_('recipe', `r${n}`, { likesCount: n }));
  const visuals = [it_('template', 't1'), it_('sticker', 's1'), it_('background', 'b1')];
  const sections = {
    landesverband: [section('agent', [it_('agent', 'lv1')])],
    neu: [section('agent', [official, it_('agent', 'other', { createdAt: '2026-08-01' })])],
    beliebt: [section('recipe', liked)],
    gestalten: [
      section('template', [visuals[0]!]),
      section('sticker', [visuals[1]!]),
      { ...section('background', [visuals[2]!]), hasMore: true },
    ],
  };
  const feature = MARKETPLACE_FEATURES[0];

  it('orders the shelves top to bottom and leaves out the ones below their minimum', () => {
    const page = composeFrontpage({ sections, curated: null, collections: [] });
    expect(page.shelves.map((s) => s.shelfId)).toEqual(['neu', 'beliebt', 'gestalten']);
    expect(page.shelves.find((s) => s.shelfId === 'gestalten')?.hasMore).toBe(true);
    expect(page.shelves.find((s) => s.shelfId === 'beliebt')?.hasMore).toBe(false);
  });

  it('falls back to the newest official item and keeps it out of „Neu"', () => {
    const page = composeFrontpage({ sections, curated: null, collections: [] });
    expect(page.featured?.ref).toBe('official');
    expect(page.featureId).toBeNull();
    expect(refs(page.shelves.find((s) => s.shelfId === 'neu')!.items)).toEqual(['other']);
  });

  it('names the curated slot when its item is there', () => {
    const item = it_('agent', feature.ref);
    const page = composeFrontpage({ sections, curated: { feature, item }, collections: [] });
    expect(page.featured).toBe(item);
    expect(page.featureId).toBe(feature.id);
    expect(featureById(page.featureId)).toBe(feature);
    expect(refs(page.shelves.find((s) => s.shelfId === 'neu')!.items)).toEqual([
      'official',
      'other',
    ]);
  });

  it('is empty, not broken, for an empty catalogue', () => {
    const empty = { landesverband: [], neu: [], beliebt: [], gestalten: [] };
    expect(composeFrontpage({ sections: empty, curated: null, collections: [] })).toEqual({
      featured: null,
      featureId: null,
      shelves: [],
      collections: [],
    });
  });
});

describe('collections', () => {
  const starter = collectionById('starter')!;

  it('keeps the pinned order, then the fills, each item once, cut to `show`', () => {
    const def = { ...starter, show: 3, min: 1 };
    const page = composeCollection(def, [
      [it_('agent', 'a1'), null, it_('recipe', 'r1')],
      [it_('recipe', 'r1'), it_('sticker', 's1'), it_('sticker', 's2')],
    ]);
    expect(page?.collectionId).toBe('starter');
    expect(refs(page!.items)).toEqual(['a1', 'r1', 's1']);
  });

  it('puts a collection’s file-only samples first, and they never read as real rows', () => {
    const wahlkampf = collectionById('wahlkampf-moritz')!;
    const page = composeCollection(wahlkampf, [[it_('agent', 'a1')]]);
    const items = page!.items;
    expect(items.at(-1)?.ref).toBe('a1');
    expect(items.slice(0, -1).every(isSampleItem)).toBe(true);
    expect(isSampleItem(it_('agent', 'a1'))).toBe(false);
    // Reachable by its link only.
    expect(wahlkampf.listed).toBe(false);
  });

  it('is left out below its minimum', () => {
    expect(composeCollection({ ...starter, min: 2 }, [[it_('agent', 'a1'), null]])).toBeNull();
  });

  // A renamed identifier would not fail anywhere else: the server drops what it
  // cannot resolve, and the collection shrinks without a word.
  it('pins only refs the official catalogue has', () => {
    for (const collection of MARKETPLACE_COLLECTIONS) {
      for (const target of collection.pinned) {
        const known =
          target.kind === 'agent'
            ? getSystemAgent(target.ref) !== undefined
            : hasSystemRecipe(target.ref);
        expect(known, `${collection.id}: ${target.kind}:${target.ref}`).toBe(true);
      }
    }
  });

  it('can always reach its minimum', () => {
    for (const collection of MARKETPLACE_COLLECTIONS) {
      const reachable =
        collection.pinned.length +
        collection.fill.reduce((n, f) => n + f.limit * f.kinds.length, 0);
      expect(reachable, collection.id).toBeGreaterThanOrEqual(collection.min);
    }
  });
});

describe('Zum Gestalten without pictures', () => {
  it('keeps a Vorlage without a picture (drawn as a mock), leaves out a bare sticker', () => {
    const plain = { ...it_('template', 'ohne'), thumbnailUrl: null } as MarketplaceItem;
    const blank = {
      ...it_('sticker', 'leer'),
      asset: { thumbUrl: null, src: '' },
    } as MarketplaceItem;
    expect(hasPreview(plain)).toBe(false);
    expect(hasPreview(blank)).toBe(false);
    expect(
      refs(
        visualShelf([
          section('template', [plain, it_('template', 't1')]),
          section('sticker', [blank, it_('sticker', 's1')]),
          section('background', [it_('background', 'b1')]),
        ])
      )
    ).toEqual(['ohne', 's1', 'b1', 't1']);
  });
});
