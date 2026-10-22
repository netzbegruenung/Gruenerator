import { describe, expect, it } from 'vitest';

import {
  patchStudioAssetPages,
  removeStudioAssetFromPages,
  toggledLike,
  type StudioAssetPages,
} from './cache.js';

import type { StudioAssetItem } from '@gruenerator/contracts';

const item = (id: string, over: Partial<StudioAssetItem> = {}): StudioAssetItem => ({
  id,
  kind: 'sticker',
  title: id,
  tags: [],
  src: `/s/${id}.png`,
  thumbUrl: null,
  width: 100,
  height: 100,
  source: 'upload',
  visibility: 'public',
  audience: 'all',
  moderation: 'ok',
  isOfficial: false,
  isOwn: false,
  authorName: null,
  likesCount: 2,
  liked: false,
  favorited: false,
  createdAt: '2026-10-01T00:00:00.000Z',
  ...over,
});

const pages = (): StudioAssetPages => ({
  pageParams: [0, 48],
  pages: [
    { items: [item('a'), item('b')], hasMore: true },
    { items: [item('c')], hasMore: false },
  ],
});

describe('studio asset cache patches', () => {
  it('patches the item on its page and keeps untouched pages by identity', () => {
    const before = pages();
    const after = patchStudioAssetPages(before, 'c', (i) => ({ ...i, favorited: true }));
    expect(after.pages[1]?.items[0]?.favorited).toBe(true);
    expect(after.pages[0]).toBe(before.pages[0]);
  });

  it('toggles a like up and down without going negative', () => {
    expect(toggledLike(item('a'))).toMatchObject({ liked: true, likesCount: 3 });
    expect(toggledLike(item('a', { liked: true, likesCount: 0 }))).toMatchObject({
      liked: false,
      likesCount: 0,
    });
  });

  it('removes an item from whichever page holds it', () => {
    const after = removeStudioAssetFromPages(pages(), 'b');
    expect(after.pages.flatMap((p) => p.items.map((i) => i.id))).toEqual(['a', 'c']);
  });
});
