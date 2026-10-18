import {
  type MarketplaceItem,
  type MarketplaceListResponse,
  type StudioAssetItem,
} from '@gruenerator/contracts';
import { type InfiniteData } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import {
  likeToggled,
  patchMarketplaceCache,
  relatedQueryKeys,
  saveToggled,
  withLike,
  withSaved,
} from './cache';

const base = {
  origin: 'oeffentlich' as const,
  description: null,
  thumbnailUrl: null,
  iconKey: null,
  authorName: null,
  audience: 'all' as const,
  likesCount: 2,
  liked: false,
  saved: false,
  isOwn: false,
  createdAt: null,
};

const recipe = (ref: string): MarketplaceItem => ({
  ...base,
  kind: 'recipe',
  key: `recipe:${ref}`,
  ref,
  title: ref,
  reportKind: 'user_text_form',
  recipe: { mention: ref, rowId: ref, skillCategory: null, system: false },
});

const asset: StudioAssetItem = {
  id: 'a1',
  kind: 'background',
  title: 'Wald',
  tags: [],
  src: '/share/a1.png',
  thumbUrl: null,
  width: 1,
  height: 1,
  source: 'upload',
  visibility: 'public',
  audience: 'all',
  moderation: 'ok',
  isOwn: false,
  authorName: null,
  likesCount: 2,
  liked: false,
  favorited: false,
  createdAt: '2026-10-01T00:00:00.000Z',
};

const background: MarketplaceItem = {
  ...base,
  kind: 'background',
  key: 'background:a1',
  ref: 'a1',
  title: 'Wald',
  reportKind: 'studio_asset',
  asset,
};

const sections = (): MarketplaceListResponse => ({
  sections: [
    { kind: 'recipe', items: [recipe('r1'), recipe('r2')], hasMore: false },
    { kind: 'background', items: [background], hasMore: true },
  ],
});

describe('patchMarketplaceCache', () => {
  it('patches the target in the sections shape and keeps the rest by identity', () => {
    const data = sections();
    const next = patchMarketplaceCache(data, { kind: 'recipe', ref: 'r2' }, likeToggled);
    expect(next.sections[0]!.items[1]).toMatchObject({ ref: 'r2', liked: true, likesCount: 3 });
    expect(next.sections[0]!.items[0]).toBe(data.sections[0]!.items[0]);
    expect(next.sections[1]).toBe(data.sections[1]);
  });

  it('patches every page of an infinite query', () => {
    const data: InfiniteData<MarketplaceListResponse, number> = {
      pages: [
        { sections: [{ kind: 'recipe', items: [recipe('r1')], hasMore: true }] },
        { sections: [{ kind: 'recipe', items: [recipe('r2')], hasMore: false }] },
      ],
      pageParams: [0, 24],
    };
    const next = patchMarketplaceCache(data, { kind: 'recipe', ref: 'r2' }, saveToggled);
    expect(next.pages[1]!.sections[0]!.items[0]!.saved).toBe(true);
    expect(next.pages[0]!.sections[0]).toBe(data.pages[0]!.sections[0]);
    expect(next.pageParams).toBe(data.pageParams);
  });

  it('patches a single cached item, and leaves another one alone', () => {
    const item = recipe('r1');
    expect(patchMarketplaceCache(item, { kind: 'recipe', ref: 'r1' }, likeToggled)).toMatchObject({
      liked: true,
      likesCount: 3,
    });
    expect(patchMarketplaceCache(item, { kind: 'recipe', ref: 'r2' }, likeToggled)).toBe(item);
  });

  it('matches on kind as well as ref', () => {
    const data = sections();
    const next = patchMarketplaceCache(data, { kind: 'background', ref: 'r1' }, likeToggled);
    expect(next.sections).toEqual(data.sections);
  });
});

describe('item updaters', () => {
  it('keeps a background’s asset in step with the item', () => {
    const liked = withLike(background, true, 9);
    const saved = withSaved(background, true);
    expect(liked).toMatchObject({ liked: true, likesCount: 9 });
    expect(liked.kind === 'background' && liked.asset).toMatchObject({
      liked: true,
      likesCount: 9,
    });
    expect(saved.kind === 'background' && saved.asset.favorited).toBe(true);
  });

  it('never counts below zero when an unlike is toggled', () => {
    expect(likeToggled({ ...recipe('r1'), liked: true, likesCount: 0 })).toMatchObject({
      liked: false,
      likesCount: 0,
    });
  });
});

describe('relatedQueryKeys', () => {
  it('names the lists outside the Marktplatz that show the same state', () => {
    expect(relatedQueryKeys('agent', 'save')).toEqual([['user-library']]);
    expect(relatedQueryKeys('recipe', 'like')).toEqual([]);
    expect(relatedQueryKeys('template', 'save')).toEqual([
      ['templateFavorites'],
      ['vorlagen-gallery'],
    ]);
    expect(relatedQueryKeys('template', 'like')).toContainEqual(['entityLikes', 'template']);
    expect(relatedQueryKeys('sticker', 'like')).toEqual([['studio-assets']]);
    expect(relatedQueryKeys('background', 'save')).toEqual([['studio-assets']]);
  });
});
