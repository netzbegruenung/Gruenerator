import { describe, expect, it } from 'vitest';

import {
  type ContentCursor,
  compareByKey,
  decodeCursor,
  encodeCursor,
  keysetWhere,
  sameKindFilter,
} from './contentCursor.js';

/**
 * The cursor and the merge comparator have to describe the same order. If they
 * drift, a row appears on two pages or on none — the failure mode offset
 * pagination has over a live table, which is what this replaces.
 */

const cursor = (over: Partial<ContentCursor> = {}): ContentCursor => ({
  date: '2026-07-01T10:00:00.000Z',
  kind: 'image',
  id: 'bbb',
  kinds: ['doc', 'image'],
  ...over,
});

describe('encode/decode', () => {
  it('round-trips a cursor', () => {
    const original = cursor();
    expect(decodeCursor(encodeCursor(original))).toEqual(original);
  });

  it('rejects anything that is not one, rather than throwing', () => {
    // A cursor arrives from the wire; a malformed one must become a 400, and
    // the handler can only do that if this returns null instead of exploding.
    expect(decodeCursor('nicht-base64!!')).toBeNull();
    expect(decodeCursor(Buffer.from('{}', 'utf8').toString('base64url'))).toBeNull();
    expect(decodeCursor(Buffer.from('[1,2]', 'utf8').toString('base64url'))).toBeNull();
  });

  it('rejects a kind that is not in the union', () => {
    const forged = Buffer.from(
      JSON.stringify({ date: 'x', kind: 'reel', id: 'a', kinds: ['doc'] }),
      'utf8'
    ).toString('base64url');
    expect(decodeCursor(forged)).toBeNull();
  });
});

describe('sameKindFilter', () => {
  it('ignores order but not membership', () => {
    expect(sameKindFilter(['doc', 'image'], ['image', 'doc'])).toBe(true);
    expect(sameKindFilter(['doc'], ['doc', 'image'])).toBe(false);
    expect(sameKindFilter(['doc'], ['image'])).toBe(false);
  });
});

describe('compareByKey', () => {
  it('puts the newest first', () => {
    const older = { date: '2026-01-01T00:00:00.000Z', kind: 'doc' as const, id: 'a' };
    const newer = { date: '2026-07-01T00:00:00.000Z', kind: 'doc' as const, id: 'a' };
    expect(compareByKey(newer, older)).toBeLessThan(0);
  });

  it('breaks a timestamp tie by kind, then by id — a total order', () => {
    // Bulk creation writes many rows in the same millisecond. Without a total
    // order the page boundary is not reproducible between two requests.
    const at = '2026-07-01T00:00:00.000Z';
    expect(
      compareByKey({ date: at, kind: 'doc', id: 'a' }, { date: at, kind: 'image', id: 'a' })
    ).toBeLessThan(0);
    expect(
      compareByKey({ date: at, kind: 'doc', id: 'b' }, { date: at, kind: 'doc', id: 'a' })
    ).toBeLessThan(0);
    expect(
      compareByKey({ date: at, kind: 'doc', id: 'a' }, { date: at, kind: 'doc', id: 'a' })
    ).toBe(0);
  });
});

describe('keysetWhere', () => {
  it('truncates the column to milliseconds on both sides', () => {
    // Postgres stores microseconds; node-postgres hands us a JS Date, which has
    // none. Comparing the rounded cursor against the raw column would drop every
    // row sharing its millisecond but not its microsecond.
    const params: unknown[] = [];
    const sql = keysetWhere('cd.updated_at', 'cd.id', 'doc', cursor({ kind: 'doc' }), params);
    expect(sql).toContain("date_trunc('milliseconds', cd.updated_at)");
    expect(sql).not.toMatch(/[^,]\bcd\.updated_at\s*[<=]/);
  });

  it('skips past the exact row for the cursor’s own kind', () => {
    const params: unknown[] = [];
    const sql = keysetWhere('cd.updated_at', 'cd.id', 'doc', cursor({ kind: 'doc' }), params);
    expect(sql).toContain('cd.id::text <');
    expect(params).toEqual(['2026-07-01T10:00:00.000Z', 'bbb']);
  });

  it('lets a later kind still take rows at the very same timestamp', () => {
    // 'video' ranks after 'image', so rows written in the same millisecond as
    // the cursor row have not been served yet.
    const params: unknown[] = [];
    const sql = keysetWhere('created_at', 'id', 'video', cursor({ kind: 'image' }), params);
    expect(sql).toContain('<=');
    expect(params).toEqual(['2026-07-01T10:00:00.000Z']);
  });

  it('excludes that timestamp for an earlier kind, which already had its turn', () => {
    const params: unknown[] = [];
    const sql = keysetWhere('cd.updated_at', 'cd.id', 'doc', cursor({ kind: 'image' }), params);
    expect(sql).toContain('<');
    expect(sql).not.toContain('<=');
    expect(params).toEqual(['2026-07-01T10:00:00.000Z']);
  });

  it('numbers its placeholders from the end of the existing params', () => {
    const params: unknown[] = ['user-1', ['doc']];
    keysetWhere('cd.updated_at', 'cd.id', 'image', cursor({ kind: 'image' }), params);
    expect(params).toHaveLength(4);
  });
});
