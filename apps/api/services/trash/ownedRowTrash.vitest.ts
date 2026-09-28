/**
 * The shared Papierkorb steps of the owner-bound tables, against an in-memory
 * table that answers the handful of statement shapes the helper issues. The
 * lifecycle is the contract: trash hides the row from the live list and shows
 * it in the Papierkorb, restore brings it back, purge removes it only while it
 * is still trashed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface Row {
  id: string;
  user_id: string;
  title: string;
  deleted_at: Date | null;
}

let rows: Row[] = [];
let restoreError: unknown = null;
const statements: string[] = [];

const norm = (sql: string): string => sql.replace(/\s+/g, ' ').trim();

function run(sql: string, params: unknown[]): Promise<unknown[]> {
  const s = norm(sql);
  statements.push(s);
  const [first] = params as [string];
  if (s.startsWith('SELECT user_id FROM agents WHERE id = $1 AND deleted_at IS NULL')) {
    return Promise.resolve(rows.filter((r) => r.id === first && !r.deleted_at));
  }
  if (s.startsWith('UPDATE agents SET deleted_at = now()')) {
    for (const r of rows) if (r.id === first && !r.deleted_at) r.deleted_at = new Date();
    return Promise.resolve([]);
  }
  if (s.startsWith('UPDATE agents SET deleted_at = NULL')) {
    if (restoreError) return Promise.reject(restoreError);
    for (const r of rows) if (r.id === first && r.deleted_at) r.deleted_at = null;
    return Promise.resolve([]);
  }
  if (s.startsWith('SELECT id, title, deleted_at, user_id FROM agents')) {
    return Promise.resolve(rows.filter((r) => r.id === first && r.deleted_at));
  }
  if (s.startsWith('SELECT id, title, deleted_at FROM agents')) {
    return Promise.resolve(rows.filter((r) => r.user_id === first && r.deleted_at));
  }
  if (s.startsWith('SELECT id, user_id FROM agents')) {
    const cutoff = first as unknown as Date;
    return Promise.resolve(rows.filter((r) => r.deleted_at && r.deleted_at < cutoff));
  }
  if (s.startsWith('DELETE FROM agents')) {
    const cutoff = params[1] as Date | null;
    const hit = rows.filter(
      (r) => r.id === first && r.deleted_at && (!cutoff || r.deleted_at < cutoff)
    );
    rows = rows.filter((r) => !hit.includes(r));
    return Promise.resolve(hit.map((r) => ({ id: r.id, user_id: r.user_id })));
  }
  return Promise.reject(new Error(`unexpected SQL: ${s}`));
}

const reportBackgroundError = vi.fn();

vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({
    query: vi.fn(run),
    transaction: <T>(fn: (client: { query: typeof run }) => Promise<T>) => fn({ query: run }),
  }),
}));
vi.mock('../../utils/reportBackgroundError.js', () => ({ reportBackgroundError }));

const {
  deleteTrashedRow,
  getTrashedOwnedRow,
  listExpiredOwnedRows,
  listTrashedOwnedRows,
  purgeSideStore,
  restoreOwnedRow,
  trashOwnedRow,
} = await import('./ownedRowTrash.js');

const TABLE = { table: 'agents', columns: 'id, title' };
const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const ID = '33333333-3333-4333-8333-333333333333';

const live = (): string[] => rows.filter((r) => !r.deleted_at).map((r) => r.id);
const trashed = async (): Promise<string[]> =>
  (await listTrashedOwnedRows(TABLE, USER, { limit: 10, before: null })).map((r) => r.id);

beforeEach(() => {
  rows = [{ id: ID, user_id: USER, title: 'Presse-Agent', deleted_at: null }];
  restoreError = null;
  statements.length = 0;
  reportBackgroundError.mockClear();
});

describe('owned-row Papierkorb lifecycle', () => {
  it('trash → gone from the list, in the Papierkorb → restore → back', async () => {
    expect(await trashOwnedRow(TABLE, USER, ID)).toBe('ok');
    expect(live()).toEqual([]);
    expect(await trashed()).toEqual([ID]);
    expect(statements.some((s) => s.startsWith('DELETE'))).toBe(false);

    expect(await restoreOwnedRow(TABLE, USER, ID)).toBe('ok');
    expect(live()).toEqual([ID]);
    expect(await trashed()).toEqual([]);
  });

  it('trash, restore and purge-now answer the same owner check', async () => {
    expect(await trashOwnedRow(TABLE, OTHER, ID)).toBe('forbidden');
    expect(live()).toEqual([ID]);

    await trashOwnedRow(TABLE, USER, ID);
    expect(await getTrashedOwnedRow(TABLE, OTHER, ID)).toBe('forbidden');
    expect(await restoreOwnedRow(TABLE, OTHER, ID)).toBe('forbidden');
    expect(await getTrashedOwnedRow(TABLE, USER, ID)).toMatchObject({
      id: ID,
      title: 'Presse-Agent',
    });
  });

  it('answers not_found for a non-uuid id without asking Postgres', async () => {
    expect(await trashOwnedRow(TABLE, USER, 'presse-agent')).toBe('not_found');
    expect(await getTrashedOwnedRow(TABLE, USER, 'presse-agent')).toBe('not_found');
    expect(await deleteTrashedRow(TABLE, 'presse-agent', null)).toBeNull();
    expect(statements).toEqual([]);
  });

  it('turns a unique violation on restore into conflict — pg code or Drizzle cause', async () => {
    await trashOwnedRow(TABLE, USER, ID);

    restoreError = Object.assign(new Error('duplicate key'), { code: '23505' });
    expect(await restoreOwnedRow(TABLE, USER, ID)).toBe('conflict');

    restoreError = Object.assign(new Error('Failed query'), { cause: { code: '23505' } });
    expect(await restoreOwnedRow(TABLE, USER, ID)).toBe('conflict');
    expect(await trashed()).toEqual([ID]);

    restoreError = new Error('connection reset');
    await expect(restoreOwnedRow(TABLE, USER, ID)).rejects.toThrow('connection reset');
  });

  it('purges only a trashed row, and only one trashed before the cutoff', async () => {
    expect(await deleteTrashedRow(TABLE, ID, null)).toBeNull();
    expect(live()).toEqual([ID]);

    await trashOwnedRow(TABLE, USER, ID);
    const before = new Date(Date.now() - 60_000);
    expect(await listExpiredOwnedRows(TABLE, before, 10)).toEqual([]);
    expect(await deleteTrashedRow(TABLE, ID, before)).toBeNull();

    const after = new Date(Date.now() + 60_000);
    expect(await listExpiredOwnedRows(TABLE, after, 10)).toEqual([{ id: ID, userId: USER }]);
    expect(await deleteTrashedRow(TABLE, ID, after, 'id, user_id')).toEqual({
      id: ID,
      user_id: USER,
    });
    expect(rows).toEqual([]);
  });

  it('lists the Papierkorb newest first by the shared keyset', async () => {
    await trashOwnedRow(TABLE, USER, ID);
    await listTrashedOwnedRows(TABLE, USER, {
      limit: 5,
      before: { deletedAt: '2026-09-01T00:00:00.000Z', id: ID },
    });
    const sql = statements.at(-1)!;
    expect(sql).toContain('WHERE deleted_at IS NOT NULL AND user_id = $1');
    expect(sql).toContain(`ORDER BY date_trunc('milliseconds', deleted_at) DESC`);
    expect(sql).toContain('LIMIT $4');
  });
});

describe('purgeSideStore', () => {
  it('reports a failing side store and never rethrows', async () => {
    await expect(
      purgeSideStore('user_agent', ID, 'qdrant', () => Promise.reject(new Error('down')))
    ).resolves.toBeUndefined();
    expect(reportBackgroundError).toHaveBeenCalledWith(expect.any(Error), {
      job: 'trash-purge',
      kind: 'user_agent',
      id: ID,
      store: 'qdrant',
    });
  });
});
