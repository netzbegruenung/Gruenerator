import { describe, expect, it } from 'vitest';

import { matchAssignee } from './cardAssignees.js';

const member = (user_id: string, display_name: string, first_name: string | null = null) => ({
  user_id,
  source: 'group' as const,
  display_name,
  first_name,
  avatar_robot_id: 1,
});

const members = [
  member('u-anna-b', 'Anna Berg', 'Anna'),
  member('u-anna-k', 'Anna Kurz', 'Anna'),
  member('u-tom', 'Tom Weber', 'Tom'),
];

describe('matchAssignee', () => {
  it('findet über Profil-Id, vollen Namen und Wortanfang', () => {
    expect(matchAssignee('u-tom', members)).toMatchObject({
      kind: 'one',
      assignee: { id: 'u-tom' },
    });
    expect(matchAssignee('anna kurz', members)).toMatchObject({
      kind: 'one',
      assignee: { id: 'u-anna-k', name: 'Anna Kurz' },
    });
    expect(matchAssignee('Weber', members)).toMatchObject({
      kind: 'one',
      assignee: { id: 'u-tom' },
    });
  });

  it('mehrere Treffer bleiben mehrdeutig, außer die Projekt-Mitgliedschaft entscheidet', () => {
    expect(matchAssignee('Anna', members)).toMatchObject({ kind: 'ambiguous' });
    expect(matchAssignee('Anna', members, new Set(['u-anna-k']))).toMatchObject({
      kind: 'one',
      assignee: { id: 'u-anna-k' },
    });
  });

  it('ohne Treffer: none (kein Wortinneres, kein leerer Name)', () => {
    expect(matchAssignee('nna', members)).toEqual({ kind: 'none' });
    expect(matchAssignee('  ', members)).toEqual({ kind: 'none' });
  });
});
