import { describe, expect, it } from 'vitest';

import { applyReaction } from './applyReaction.js';

describe('applyReaction', () => {
  const base = [
    { emoji: '👍', count: 2, reacted: false },
    { emoji: '🎉', count: 1, reacted: true },
  ];

  it('increments an existing entry and marks it reacted', () => {
    expect(applyReaction(base, '👍', true)).toEqual([
      { emoji: '👍', count: 3, reacted: true },
      { emoji: '🎉', count: 1, reacted: true },
    ]);
  });

  it('appends a new entry at the end', () => {
    expect(applyReaction(base, '🚀', true)).toEqual([
      ...base,
      { emoji: '🚀', count: 1, reacted: true },
    ]);
  });

  it('decrements an entry with other reactors and clears reacted', () => {
    const list = [{ emoji: '❤️', count: 3, reacted: true }];
    expect(applyReaction(list, '❤️', false)).toEqual([{ emoji: '❤️', count: 2, reacted: false }]);
  });

  it('drops an entry that reaches zero', () => {
    expect(applyReaction(base, '🎉', false)).toEqual([{ emoji: '👍', count: 2, reacted: false }]);
  });

  it('is idempotent when already in the target state', () => {
    expect(applyReaction(base, '🎉', true)).toBe(base);
    expect(applyReaction(base, '👍', false)).toBe(base);
    expect(applyReaction(base, '👀', false)).toBe(base);
  });

  it('does not mutate its input', () => {
    const snapshot = structuredClone(base);
    applyReaction(base, '👍', true);
    applyReaction(base, '🎉', false);
    expect(base).toEqual(snapshot);
  });

  it('handles legacy emojis outside the fixed set', () => {
    const list = [{ emoji: '💡', count: 1, reacted: true }];
    expect(applyReaction(list, '💡', false)).toEqual([]);
  });
});
