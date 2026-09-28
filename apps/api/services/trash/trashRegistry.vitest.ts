import { trashKindSchema } from '@gruenerator/contracts';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query: vi.fn() }),
}));

const { TRASH_KINDS, TRASH_RETENTION_DAYS, purgeAtFor, toTrashItem, trashHandlerFor } =
  await import('./trashRegistry.js');
const { compareTrashKey, decodeTrashCursor, encodeTrashCursor, trashKeysetWhere } =
  await import('./trashCursor.js');

describe('purgeAt', () => {
  it('is deletedAt plus the retention period, computed on the server', () => {
    expect(TRASH_RETENTION_DAYS).toBe(30);
    const deletedAt = new Date('2026-09-28T21:15:30.456Z');
    expect(purgeAtFor(deletedAt).toISOString()).toBe('2026-10-28T21:15:30.456Z');
  });

  it('is carried on every item', () => {
    const item = toTrashItem({
      kind: 'collaborative_document',
      id: 'doc-1',
      title: 'Antrag',
      subtype: 'sheets',
      deletedAt: new Date('2026-01-31T00:00:00.000Z'),
    });
    expect(item).toEqual({
      kind: 'collaborative_document',
      id: 'doc-1',
      title: 'Antrag',
      subtype: 'sheets',
      deletedAt: '2026-01-31T00:00:00.000Z',
      purgeAt: '2026-03-02T00:00:00.000Z',
    });
  });
});

describe('trash cursor', () => {
  it('round-trips', () => {
    const cursor = { deletedAt: '2026-09-28T21:15:30.456Z', id: 'b7c1-…' };
    expect(decodeTrashCursor(encodeTrashCursor(cursor))).toEqual(cursor);
  });

  it('rejects garbage instead of paging from an arbitrary place', () => {
    expect(decodeTrashCursor('not-base64-json')).toBeNull();
    expect(decodeTrashCursor(Buffer.from('{"id":"x"}').toString('base64url'))).toBeNull();
    expect(
      decodeTrashCursor(Buffer.from('{"id":"x","deletedAt":"gestern"}').toString('base64url'))
    ).toBeNull();
  });

  it('orders newest deletion first, then id ascending — the same key the SQL uses', () => {
    const rows = [
      { deletedAt: '2026-09-01T10:00:00.000Z', id: 'b' },
      { deletedAt: '2026-09-02T10:00:00.000Z', id: 'z' },
      { deletedAt: '2026-09-01T10:00:00.000Z', id: 'a' },
    ];
    expect([...rows].sort(compareTrashKey).map((r) => r.id)).toEqual(['z', 'a', 'b']);

    const params: unknown[] = [];
    const where = trashKeysetWhere('deleted_at', 'id', rows[0], params);
    expect(where).toContain("date_trunc('milliseconds', deleted_at) < $1::timestamptz");
    expect(where).toContain('id::text COLLATE "C" > $2');
    expect(params).toEqual(['2026-09-01T10:00:00.000Z', 'b']);
    expect(trashKeysetWhere('deleted_at', 'id', null, [])).toBe('TRUE');
  });
});

describe('TRASH_KINDS', () => {
  it('only registers kinds the contract knows, each with the full handler', () => {
    const kinds = Object.keys(TRASH_KINDS);
    expect(kinds.length).toBeGreaterThan(0);
    for (const kind of kinds) {
      expect(trashKindSchema.options).toContain(kind);
      const handler = trashHandlerFor(trashKindSchema.parse(kind));
      for (const method of [
        'listTrashed',
        'getTrashed',
        'trash',
        'restore',
        'purge',
        'listExpired',
      ] as const) {
        expect(typeof handler?.[method], `${kind}.${method}`).toBe('function');
      }
    }
  });

  it('has no handler for a kind that is not wired yet', () => {
    expect(trashHandlerFor('collaborative_document')).not.toBeNull();
    expect(trashHandlerFor('group')).toBeNull();
  });
});
