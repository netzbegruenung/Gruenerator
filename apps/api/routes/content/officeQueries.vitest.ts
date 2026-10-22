import { officeQuerySchema, officeResponseSchema } from '@gruenerator/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn<(sql: string, params: unknown[]) => Promise<unknown[]>>();
vi.mock('../../database/services/PostgresService/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query }),
}));
const { listOffice } = await import('./officeQueries.js');

beforeEach(() => query.mockReset());

const row = (id: string, subtype = 'blank') => ({
  id,
  title: id,
  updated_at: new Date('2026-10-20T10:00:00Z'),
  document_subtype: subtype,
  content: '<p>Inhalt</p>',
  creator_name: null,
  access_type: 'owner',
  group_shares: [],
  total: '151',
});

describe('Office library', () => {
  it('continues beyond the first page and keeps document types in server order', async () => {
    query.mockResolvedValue([row('old-sheet', 'sheets'), row('old-board', 'boards')]);
    const result = await listOffice('user-1', { offset: '100', limit: '2', sort: 'oldest' });
    expect(result.items.map((item) => item.id)).toEqual(['old-sheet', 'old-board']);
    expect(result).toMatchObject({ total: 151, offset: 100, limit: 2, hasMore: true });
    expect(officeResponseSchema.safeParse(result).success).toBe(true);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('ORDER BY updated_at ASC, id ASC');
    expect(params.slice(-2)).toEqual([2, 100]);
  });

  it('searches all accessible content before paging and escapes literal wildcards', async () => {
    query.mockResolvedValue([row('match')]);
    await listOffice('user-1', { typ: 'sheet', search: '100%_Budget' });
    const [sql, params] = query.mock.calls[0];
    expect(sql.indexOf('cd.title ILIKE $3 OR cd.content ILIKE $3')).toBeLessThan(
      sql.indexOf('LIMIT')
    );
    expect(sql).toContain("cd.document_subtype IN ('sheets', 'tabelle')");
    expect(params[2]).toBe('%100\\%\\_Budget%');
    expect(sql).toContain('gm.is_active = TRUE');
    expect(sql).toContain('lg.deleted_at IS NULL');
    expect(sql).toContain("(gcs.permissions->>'read')::boolean IS NOT FALSE");
    expect(sql).toContain('cd.is_deleted = false');
  });

  it('lists slide canvases as presentations but keeps sharepics out', async () => {
    query.mockResolvedValue([row('deck', 'canvas')]);
    const pres = await listOffice('user-1', { typ: 'pres' });
    expect(pres.items[0].document_subtype).toBe('canvas');
    const [presSql, presParams] = query.mock.calls[0];
    expect(presSql).toContain("cd.document_subtype = 'presentations' OR");
    expect(presSql).toContain("sc.format = 'slide-16-9'");
    // Papierkorb-Zeilen bleiben draussen: derselbe Zugriffs-Filter wie für alle Typen.
    expect(presSql).toContain('cd.is_deleted = false');
    expect(presParams[1]).toContain('canvas');

    await listOffice('user-1', { typ: 'all' });
    expect(query.mock.calls[1][0]).toContain("cd.document_subtype <> 'canvas' OR");
    await listOffice('user-1', { typ: 'doc' });
    expect(query.mock.calls[2][0]).toContain("'presentations', 'canvas')");
  });

  it('preserves the total on an empty page and stops loading', async () => {
    query.mockResolvedValue([{ id: null, total: '151' }]);
    expect(await listOffice('user-1', { offset: '200' })).toEqual({
      items: [],
      total: 151,
      limit: 50,
      offset: 200,
      hasMore: false,
    });
  });

  it('bounds page sizes and rejects invalid filters, sorts and offsets at the contract', async () => {
    query.mockResolvedValue([]);
    expect((await listOffice('user-1', { limit: '10000' })).limit).toBe(100);
    for (const invalid of [
      { typ: 'canvas' },
      { sort: 'DROP TABLE' },
      { offset: '-1' },
      { limit: '1.5' },
    ]) {
      expect(officeQuerySchema.safeParse(invalid).success).toBe(false);
    }
  });
});
