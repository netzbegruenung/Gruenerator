import { describe, expect, it } from 'vitest';

import { canShareIntoGroup, isGroupArchived, sortGroups, splitArchivedGroups } from './types.js';

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

describe('sortGroups', () => {
  const groups = [
    { name: 'Zebra', created_at: '2026-01-01T00:00:00Z', last_activity_at: '2026-11-20T00:00:00Z' },
    { name: 'Apfel', created_at: '2026-05-01T00:00:00Z', last_activity_at: null },
    { name: 'Mango', created_at: '2026-03-01T00:00:00Z', last_activity_at: '2026-11-21T00:00:00Z' },
  ];

  it('sorts by last activity, falling back to creation date', () => {
    expect(sortGroups(groups, 'activity').map((g) => g.name)).toEqual(['Mango', 'Zebra', 'Apfel']);
  });

  it('sorts by name and by newest without mutating the input', () => {
    expect(sortGroups(groups, 'name').map((g) => g.name)).toEqual(['Apfel', 'Mango', 'Zebra']);
    expect(sortGroups(groups, 'newest').map((g) => g.name)).toEqual(['Apfel', 'Mango', 'Zebra']);
    expect(groups[0]?.name).toBe('Zebra');
  });
});
