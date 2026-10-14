import { describe, expect, it } from 'vitest';

import { asStudioAssetMenuId, buildStudioAssetActions } from './studioAssetModel';

const base = {
  isOwn: false,
  visibility: 'public' as const,
  moderation: 'ok' as const,
  liked: false,
  favorited: false,
};

const ids = (item: Parameters<typeof buildStudioAssetActions>[0]) =>
  buildStudioAssetActions(item).map((a) => a.id);

describe('buildStudioAssetActions', () => {
  it('offers Melden on others’ items and no management', () => {
    expect(ids(base)).toEqual(['use', 'like', 'favorite', 'report']);
  });

  it('manages own items and never reports them', () => {
    expect(ids({ ...base, isOwn: true })).toEqual([
      'use',
      'like',
      'favorite',
      'private',
      'rename',
      'delete',
    ]);
    expect(ids({ ...base, isOwn: true, visibility: 'private' })).toContain('publish');
  });

  it('does not offer publishing a removed item', () => {
    const removed = ids({ ...base, isOwn: true, visibility: 'private', moderation: 'removed' });
    expect(removed).not.toContain('publish');
    expect(removed).not.toContain('private');
  });

  it('labels the toggles by their current state and flags delete', () => {
    const actions = buildStudioAssetActions({ ...base, isOwn: true, liked: true, favorited: true });
    expect(actions.find((a) => a.id === 'like')?.title).toBe('Gefällt mir nicht mehr');
    expect(actions.find((a) => a.id === 'favorite')?.title).toBe('Nicht mehr merken');
    expect(actions.find((a) => a.id === 'delete')?.attributes?.destructive).toBe(true);
  });
});

describe('asStudioAssetMenuId', () => {
  it('narrows known ids and drops unknown ones', () => {
    expect(asStudioAssetMenuId('report')).toBe('report');
    expect(asStudioAssetMenuId('hide')).toBeNull();
  });
});
