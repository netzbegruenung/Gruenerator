import { describe, expect, it } from 'vitest';

import { rankByUsage } from './usageRanking.js';

const byName = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
const items = ['a', 'b', 'c', 'd'].map((id) => ({ id }));

describe('rankByUsage', () => {
  it('puts used items first by count, then by most recent use', () => {
    const map = {
      a: { useCount: 1, lastUsedAt: '2026-11-20T00:00:00Z' },
      b: { useCount: 3, lastUsedAt: '2026-11-01T00:00:00Z' },
      c: { useCount: 3, lastUsedAt: '2026-11-10T00:00:00Z' },
    };
    expect(rankByUsage(items, (i) => i.id, map, byName).map((i) => i.id)).toEqual([
      'c',
      'b',
      'a',
      'd',
    ]);
  });

  it('orders never-used items by the fallback and does not mutate the input', () => {
    const reversed = [...items].reverse();
    const out = rankByUsage(reversed, (i) => i.id, new Map(), byName);
    expect(out.map((i) => i.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(reversed[0]?.id).toBe('d');
  });
});
