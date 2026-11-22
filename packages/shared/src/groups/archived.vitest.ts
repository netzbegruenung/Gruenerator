import { describe, expect, it } from 'vitest';

import { canShareIntoGroup, isGroupArchived, splitArchivedGroups } from './types.js';

describe('archived projects', () => {
  it('splits active from archived, keeping order', () => {
    const groups = [
      { id: 'a', archived_at: null },
      { id: 'b', archived_at: '2026-11-22T10:00:00Z' },
      { id: 'c' },
    ];
    const { active, archived } = splitArchivedGroups(groups);
    expect(active.map((g) => g.id)).toEqual(['a', 'c']);
    expect(archived.map((g) => g.id)).toEqual(['b']);
  });

  it('treats an archived project as read-only on the client too', () => {
    expect(isGroupArchived({ archived_at: '2026-11-22T10:00:00Z' })).toBe(true);
    expect(canShareIntoGroup({ isAdmin: true, archived_at: '2026-11-22T10:00:00Z' })).toBe(false);
    expect(canShareIntoGroup({ isAdmin: false })).toBe(true);
  });
});
