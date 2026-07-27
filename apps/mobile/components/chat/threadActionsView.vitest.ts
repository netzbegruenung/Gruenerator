import { describe, expect, it } from 'vitest';

import { buildShareableGroups, sanitizeThreadTitle } from './threadActionsView';

describe('buildShareableGroups', () => {
  it('marks the groups a thread already reaches', () => {
    const rows = buildShareableGroups(
      [
        { id: 'g1', name: 'Kreisverband' },
        { id: 'g2', name: 'Ortsgruppe' },
      ],
      [{ group_id: 'g2', group_name: 'Ortsgruppe' }]
    );

    expect(rows).toEqual([
      { id: 'g1', name: 'Kreisverband', isShared: false },
      { id: 'g2', name: 'Ortsgruppe', isShared: true },
    ]);
  });

  // Someone shares a thread and later leaves the group. The share is still real;
  // dropping the row would leave it live with no way to revoke it.
  it('keeps a share with a group the user has since left', () => {
    const rows = buildShareableGroups(
      [{ id: 'g1', name: 'Kreisverband' }],
      [{ group_id: 'gone', group_name: 'Alte Gruppe' }]
    );

    expect(rows).toContainEqual({ id: 'gone', name: 'Alte Gruppe', isShared: true });
  });

  it('lists that group only once when the user is still a member', () => {
    const rows = buildShareableGroups(
      [{ id: 'g1', name: 'Kreisverband' }],
      [{ group_id: 'g1', group_name: 'Kreisverband' }]
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.isShared).toBe(true);
  });

  it('sorts by name so the list does not reorder as shares change', () => {
    const rows = buildShareableGroups(
      [
        { id: 'g1', name: 'Zehlendorf' },
        { id: 'g2', name: 'Ärztenetzwerk' },
        { id: 'g3', name: 'Mitte' },
      ],
      []
    );

    expect(rows.map((r) => r.name)).toEqual(['Ärztenetzwerk', 'Mitte', 'Zehlendorf']);
  });

  it('is empty when the user has no groups and no shares', () => {
    expect(buildShareableGroups([], [])).toEqual([]);
  });
});

describe('sanitizeThreadTitle', () => {
  it('returns the trimmed title', () => {
    expect(sanitizeThreadTitle('  Wahlkampf 2026 ', 'Neue Unterhaltung')).toBe('Wahlkampf 2026');
  });

  it('rejects an empty title', () => {
    expect(sanitizeThreadTitle('', 'Alt')).toBeNull();
    expect(sanitizeThreadTitle('   ', 'Alt')).toBeNull();
  });

  it('rejects an unchanged title so a no-op never reaches the backend', () => {
    expect(sanitizeThreadTitle('Alt', 'Alt')).toBeNull();
    expect(sanitizeThreadTitle(' Alt ', 'Alt')).toBeNull();
  });

  it('accepts any title for a thread that has none yet', () => {
    expect(sanitizeThreadTitle('Neu', undefined)).toBe('Neu');
  });
});
