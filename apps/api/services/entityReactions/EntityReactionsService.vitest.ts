/**
 * Reaktionen gegen eine Fake-Drizzle-Kette: idempotentes Schreiben über den
 * Unique-Schlüssel, ein Query für viele ids, Sortierung der Zusammenfassung.
 */
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
  addReaction,
  deleteReactionsForEntities,
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
  it('schreibt idempotent über den vollen Unique-Schlüssel', async () => {
    await addReaction('u1', 'group_share', 's1', '🎉');
    expect(values).toHaveBeenCalledWith({
      user_id: 'u1',
      entity_type: 'group_share',
      entity_id: 's1',
      emoji: '🎉',
    });
    expect(onConflictDoNothing).toHaveBeenCalledWith({
      target: [
        entityReactions.entity_type,
        entityReactions.entity_id,
        entityReactions.user_id,
        entityReactions.emoji,
      ],
    });
  });

  it('liefert die neue Zeile, bei Konflikt null', async () => {
    const row = { id: 'r1', entity_id: 's1' };
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
      entity_type: 'board_comment',
      entity_id,
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

describe('deleteReactionsForEntities', () => {
  it('leere ids → kein Query', async () => {
    await deleteReactionsForEntities('group_share', []);
    expect(del).not.toHaveBeenCalled();
  });

  it('löscht alle ids eines Typs in einem Statement', async () => {
    await deleteReactionsForEntities('group_share', ['a', 'b']);
    expect(deleteWhere).toHaveBeenCalledTimes(1);
  });
});
