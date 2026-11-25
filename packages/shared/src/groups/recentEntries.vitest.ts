import { describe, expect, it } from 'vitest';

import { pickRecentEntries } from './recentEntries.js';

const stat = (iso: string) => ({ useCount: 1, lastUsedAt: iso });

describe('pickRecentEntries', () => {
  it('mixes projects and notebooks, newest first', () => {
    const out = pickRecentEntries(
      [{ id: 'a' }, { id: 'b' }],
      [{ id: 'n1' }],
      { a: stat('2026-11-01T10:00:00Z'), b: stat('2026-11-03T10:00:00Z') },
      { n1: stat('2026-11-02T10:00:00Z') }
    );
    expect(out.map((e) => e.key)).toEqual(['p-b', 'n-n1', 'p-a']);
  });

  it('skips items without usage and returns nothing when none was used', () => {
    expect(pickRecentEntries([{ id: 'a' }], [{ id: 'n' }], {}, undefined)).toEqual([]);
  });

  it('caps at four and accepts Map usage', () => {
    const projects = ['1', '2', '3', '4', '5'].map((id) => ({ id }));
    const usage = new Map(projects.map((p, i) => [p.id, stat(`2026-11-0${i + 1}T00:00:00Z`)]));
    const out = pickRecentEntries(projects, [], usage, null);
    expect(out.map((e) => e.key)).toEqual(['p-5', 'p-4', 'p-3', 'p-2']);
  });
});
