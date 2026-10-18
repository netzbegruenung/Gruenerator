import { type MarketplaceItem, type MarketplaceSection } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { DEFAULT_MARKETPLACE_FILTERS } from './filters';
import {
  MARKETPLACE_FEATURES,
  composeFrontpage,
  fallbackFeature,
  featureById,
  featureFor,
  isFrontpageView,
  landesverbandShelf,
  newestShelf,
  popularShelf,
  visualShelf,
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
    const page = composeFrontpage({ sections, curated: null });
    expect(page.shelves.map((s) => s.shelfId)).toEqual(['neu', 'beliebt', 'gestalten']);
    expect(page.shelves.find((s) => s.shelfId === 'gestalten')?.hasMore).toBe(true);
    expect(page.shelves.find((s) => s.shelfId === 'beliebt')?.hasMore).toBe(false);
  });

  it('falls back to the newest official item and keeps it out of „Neu"', () => {
    const page = composeFrontpage({ sections, curated: null });
    expect(page.featured?.ref).toBe('official');
    expect(page.featureId).toBeNull();
    expect(refs(page.shelves.find((s) => s.shelfId === 'neu')!.items)).toEqual(['other']);
  });

  it('names the curated slot when its item is there', () => {
    const item = it_('agent', feature.ref);
    const page = composeFrontpage({ sections, curated: { feature, item } });
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
    expect(composeFrontpage({ sections: empty, curated: null })).toEqual({
      featured: null,
      featureId: null,
      shelves: [],
    });
  });
});
