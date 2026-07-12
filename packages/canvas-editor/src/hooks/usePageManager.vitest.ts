import { describe, it, expect } from 'vitest';

import { nextPageIdAfterRemoval } from './usePageManager';

const pages = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];

describe('nextPageIdAfterRemoval', () => {
  it('keeps the current selection when it survives', () => {
    expect(nextPageIdAfterRemoval(pages, 'a', 'c')).toBe('c');
    expect(nextPageIdAfterRemoval(pages, 'd', 'b')).toBe('b');
  });

  it('selects the follower when the current page is removed', () => {
    expect(nextPageIdAfterRemoval(pages, 'b', 'b')).toBe('c');
  });

  it('selects the new last page when the last page is removed', () => {
    expect(nextPageIdAfterRemoval(pages, 'd', 'd')).toBe('c');
  });

  it('falls back by position when the current id is already gone (remote)', () => {
    expect(nextPageIdAfterRemoval(pages, 'b', 'gone')).toBe('c');
  });

  it('returns null when nothing survives', () => {
    expect(nextPageIdAfterRemoval([{ id: 'only' }], 'only', 'only')).toBeNull();
  });
});
