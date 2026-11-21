import { type GroupFeedItem } from '@gruenerator/shared/groups';
import { describe, expect, it } from 'vitest';

import {
  canToggleEmoji,
  hasReacted,
  patchFeedShareReactions,
  reactionChipLabel,
} from './reactions';

const item = (shareId: string | null) =>
  ({
    key: shareId ?? 'x',
    share: shareId ? { shareId, reactions: [{ emoji: '👍', count: 1, reacted: false }] } : null,
  }) as unknown as GroupFeedItem;

describe('patchFeedShareReactions', () => {
  it('patches only the matching share', () => {
    const out = patchFeedShareReactions([item('a'), item('b'), item(null)], 'b', () => [
      { emoji: '🎉', count: 2, reacted: true },
    ]);
    expect(out[0]?.share?.reactions[0]?.emoji).toBe('👍');
    expect(out[1]?.share?.reactions).toEqual([{ emoji: '🎉', count: 2, reacted: true }]);
    expect(out[2]).toEqual(item(null));
  });
});

describe('reactionChipLabel', () => {
  it('reads count and own state', () => {
    expect(reactionChipLabel({ emoji: '👍', count: 3, reacted: true })).toBe(
      '👍, 3 Reaktionen, du hast reagiert'
    );
    expect(reactionChipLabel({ emoji: '👍', count: 1, reacted: false })).toBe('👍, 1 Reaktion');
  });
});

describe('toggle rules', () => {
  it('finds own reactions', () => {
    expect(hasReacted([{ emoji: '👍', count: 1, reacted: true }], '👍')).toBe(true);
    expect(hasReacted([], '👍')).toBe(false);
  });
  it('lets legacy emojis only be removed', () => {
    expect(canToggleEmoji('💡', false)).toBe(false);
    expect(canToggleEmoji('💡', true)).toBe(true);
    expect(canToggleEmoji('👍', false)).toBe(true);
  });
});
