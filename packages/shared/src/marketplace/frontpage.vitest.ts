import { type MarketplaceItem, type MarketplaceSection } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { DEFAULT_MARKETPLACE_FILTERS } from './filters';
import {
  fallbackFeature,
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
