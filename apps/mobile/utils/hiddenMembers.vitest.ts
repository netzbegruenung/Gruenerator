import { type GroupShareComment } from '@gruenerator/contracts';
import { type GroupFeedItem } from '@gruenerator/shared/groups';
import { describe, expect, it } from 'vitest';

import {
  canHidePerson,
  feedItemPersonId,
  filterHiddenComments,
  filterHiddenFeed,
} from './hiddenMembers';

const post = (authorId: string | null, sharedById: string | null = null) =>
  ({ key: `p-${authorId}`, post: { authorId }, sharedById }) as unknown as GroupFeedItem;
const share = (sharedById: string | null) =>
  ({ key: `s-${sharedById}`, post: null, sharedById }) as unknown as GroupFeedItem;
const comment = (id: string, userId: string | null, parentId: string | null = null) =>
  ({ id, userId, parentId }) as unknown as GroupShareComment;

describe('feed filter', () => {
  const items = [post('a'), share('b'), share(null), post(null)];

  it('drops posts by author and shares by sharer, keeps unknown ids', () => {
    expect(filterHiddenFeed(items, new Set(['a', 'b']))).toEqual([items[2], items[3]]);
  });

  it('returns the same list when nothing is hidden', () => {
    expect(filterHiddenFeed(items, new Set())).toBe(items);
  });

  it('resolves the person id', () => {
    expect(feedItemPersonId(post('a'))).toBe('a');
    expect(feedItemPersonId(share('b'))).toBe('b');
    expect(feedItemPersonId(share(null))).toBeNull();
  });
});

describe('comment filter', () => {
  it('drops hidden comments and replies to them', () => {
    const list = [
      comment('1', 'a'),
      comment('2', 'b', '1'),
      comment('3', 'b'),
      comment('4', 'c', '3'),
    ];
    expect(filterHiddenComments(list, new Set(['a'])).map((c) => c.id)).toEqual(['3', '4']);
  });
});

describe('canHidePerson', () => {
  it('never offers own or unknown people', () => {
    expect(canHidePerson('a', 'me')).toBe(true);
    expect(canHidePerson('me', 'me')).toBe(false);
    expect(canHidePerson(null, 'me')).toBe(false);
  });
});
