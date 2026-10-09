/**
 * Reaktionen gegen eine Fake-Drizzle-Kette: Typ → FK-Spalte, idempotentes
 * Schreiben über die partiellen Unique-Indizes, ein Query für viele ids,
 * Sortierung der Zusammenfassung. Dazu der Migrationstext: FK-Spalten mit
 * Cascade, CHECK und partielle Unique-Indizes.
 */
import { readFileSync } from 'node:fs';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { entityReactions } from '../../database/schema/index.js';

const returning = vi.fn(async (): Promise<unknown[]> => []);
const onConflictDoNothing = vi.fn(() => ({ returning }));
const values = vi.fn(() => ({ onConflictDoNothing }));
const insert = vi.fn(() => ({ values }));
const deleteWhere = vi.fn(async () => undefined);
const del = vi.fn(() => ({ where: deleteWhere }));
const groupBy = vi.fn(async (): Promise<unknown[]> => []);
const orderBy = vi.fn(async (): Promise<unknown[]> => []);
const select = vi.fn(() => ({ from: () => ({ where: () => ({ groupBy, orderBy }) }) }));

vi.mock('../../database/services/DrizzleService.js', () => ({
  getDrizzleInstance: () => ({ insert, delete: del, select }),
}));

const {
  REACTION_TARGET_COLUMN,
  addReaction,
  getReactionRows,
  getReactionSummaries,
  removeReaction,
  summarizeReactionRows,
  toReactionSummaries,
} = await import('./EntityReactionsService.js');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('addReaction / removeReaction', () => {
  it('bildet jeden Typ auf seine FK-Spalte ab', () => {
    expect(REACTION_TARGET_COLUMN).toEqual({
      group_share: entityReactions.group_share_id,
      group_comment: entityReactions.group_comment_id,
      board_comment: entityReactions.board_comment_id,
      template: entityReactions.template_id,
    });
  });

  it.each([
    ['group_share', 'group_share_id'],
    ['group_comment', 'group_comment_id'],
    ['board_comment', 'board_comment_id'],
    ['template', 'template_id'],
  ] as const)('%s schreibt in %s, idempotent ohne Konfliktziel', async (type, column) => {
    await addReaction('u1', type, 'e1', '🎉');
    expect(values).toHaveBeenCalledWith({ user_id: 'u1', [column]: 'e1', emoji: '🎉' });
    expect(onConflictDoNothing).toHaveBeenCalledWith();
  });

  it('liefert die neue Zeile, bei Konflikt null', async () => {
    const row = { id: 'r1', group_share_id: 's1' };
    returning.mockResolvedValueOnce([row]);
    expect(await addReaction('u1', 'group_share', 's1', '🎉')).toBe(row);
    expect(await addReaction('u1', 'group_share', 's1', '🎉')).toBeNull();
  });

  it('löscht auch, wenn es nichts zu löschen gibt, ohne Fehler', async () => {
    await expect(removeReaction('u1', 'board_comment', 'c1', '👍')).resolves.toBeUndefined();
    expect(del).toHaveBeenCalledWith(entityReactions);
    expect(deleteWhere).toHaveBeenCalledTimes(1);
  });
});

describe('getReactionSummaries', () => {
  it('leere ids → leere Map ohne Query', async () => {
    const map = await getReactionSummaries('group_comment', [], 'u1');
    expect(map.size).toBe(0);
    expect(select).not.toHaveBeenCalled();
  });

  it('ein Query für alle ids, reacted aus der Zeile', async () => {
    groupBy.mockResolvedValueOnce([
      { entity_id: 'a', emoji: '👍', count: 2, reacted: true, first_at: '2026-09-01T10:00:00Z' },
      { entity_id: 'b', emoji: '👀', count: 1, reacted: false, first_at: '2026-09-01T10:00:00Z' },
    ]);
    const map = await getReactionSummaries('group_share', ['a', 'b', 'c'], 'u1');
    expect(select).toHaveBeenCalledTimes(1);
    expect(map.get('a')).toEqual([{ emoji: '👍', count: 2, reacted: true }]);
    expect(map.get('b')).toEqual([{ emoji: '👀', count: 1, reacted: false }]);
    expect(map.has('c')).toBe(false);
  });
});

describe('toReactionSummaries', () => {
  it('sortiert nach erstem Auftreten, dann Emoji-Reihenfolge, fremde Emojis zuletzt', () => {
    const t = '2026-09-01T10:00:00Z';
    const map = toReactionSummaries([
      { entity_id: 'x', emoji: '💡', count: 1, reacted: false, first_at: t },
      { entity_id: 'x', emoji: '👀', count: 1, reacted: false, first_at: t },
      { entity_id: 'x', emoji: '👍', count: 1, reacted: false, first_at: t },
      { entity_id: 'x', emoji: '🚀', count: 3, reacted: true, first_at: '2026-08-31T09:00:00Z' },
      { entity_id: 'x', emoji: '❤️', count: 1, reacted: false, first_at: new Date(t) },
    ]);
    expect(map.get('x')?.map((r) => r.emoji)).toEqual(['🚀', '👍', '❤️', '👀', '💡']);
  });
});

describe('getReactionRows / summarizeReactionRows', () => {
  it('leere ids → kein Query', async () => {
    expect(await getReactionRows('board_comment', [])).toEqual([]);
    expect(select).not.toHaveBeenCalled();
  });

  it('ein Query, nach created_at sortiert', async () => {
    await getReactionRows('board_comment', ['a', 'b']);
    expect(select).toHaveBeenCalledTimes(1);
    expect(orderBy).toHaveBeenCalledTimes(1);
  });

  it('fasst Zeilen wie getReactionSummaries zusammen', () => {
    const row = (entity_id: string, user_id: string, emoji: string, iso: string) => ({
      id: `${entity_id}-${user_id}-${emoji}`,
      group_share_id: null,
      group_comment_id: null,
      board_comment_id: entity_id,
      template_id: null,
      user_id,
      emoji,
      created_at: new Date(iso),
    });
    const map = summarizeReactionRows(
      [
        row('a', 'u2', '👍', '2026-09-01T10:05:00Z'),
        row('a', 'u1', '💡', '2026-09-01T10:01:00Z'),
        row('a', 'u1', '👍', '2026-09-01T10:02:00Z'),
        row('b', 'u2', '🎉', '2026-09-01T10:00:00Z'),
      ],
      'u1'
    );
    expect(map.get('a')).toEqual([
      { emoji: '💡', count: 1, reacted: true },
      { emoji: '👍', count: 2, reacted: true },
    ]);
    expect(map.get('b')).toEqual([{ emoji: '🎉', count: 1, reacted: false }]);
  });
});

describe('Migration', () => {
  const sql = readFileSync(
    new URL('../../database/postgres/migrations/zz_20261001_entity_reactions.sql', import.meta.url),
    'utf8'
  ).replace(/\s+/g, ' ');

  it.each([
    ['group_share_id', 'group_content_shares'],
    ['group_comment_id', 'group_share_comments'],
    ['board_comment_id', 'board_comments'],
  ])('%s verweist mit ON DELETE CASCADE auf %s', (column, table) => {
    expect(sql).toContain(`${column} UUID REFERENCES ${table}(id) ON DELETE CASCADE`);
    expect(sql).toMatch(
      new RegExp(
        `CREATE UNIQUE INDEX IF NOT EXISTS \\w+ ON entity_reactions \\(${column}, user_id, emoji\\) WHERE ${column} IS NOT NULL`
      )
    );
  });

  it('verlangt genau ein Ziel je Zeile', () => {
    expect(sql).toContain(
      'CHECK (num_nonnulls(group_share_id, group_comment_id, board_comment_id) = 1)'
    );
  });
});

describe('Migration Vorlagen', () => {
  const sql = readFileSync(
    new URL(
      '../../database/postgres/migrations/zz_20261011_entity_reactions_template.sql',
      import.meta.url
    ),
    'utf8'
  ).replace(/\s+/g, ' ');

  it('legt template_id als TEXT ohne FK an, mit eigenem partiellen Unique-Index', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS template_id TEXT;');
    expect(sql).toContain(
      'ON entity_reactions (template_id, user_id, emoji) WHERE template_id IS NOT NULL'
    );
  });

  it('erweitert den Ein-Ziel-CHECK um template_id', () => {
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS entity_reactions_one_target');
    expect(sql).toContain(
      'CHECK (num_nonnulls(group_share_id, group_comment_id, board_comment_id, template_id) = 1)'
    );
  });
});
