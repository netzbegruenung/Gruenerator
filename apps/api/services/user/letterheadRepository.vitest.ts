/**
 * The stateful bits of the catalogue: which row ends up being the default.
 *
 * That logic is easy to get subtly wrong and invisible until a user exports
 * with the wrong Absender, so it is pinned here. Drizzle is faked at the query
 * level — enough to assert WHICH statements run in which order, which is the
 * actual contract (the partial unique index does the rest in Postgres).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

interface Recorded {
  kind: 'select' | 'insert' | 'update' | 'delete';
  inTransaction: boolean;
  set?: Record<string, unknown>;
}

const recorded: Recorded[] = [];
/** Results handed to consecutive select() calls, in order. */
let selectQueue: Array<Array<{ id: string } | { is_default: boolean }>> = [];

/** Chainable stub — every builder method returns the thenable itself. */
function builder(kind: Recorded['kind'], inTransaction: boolean, result: unknown) {
  const entry: Recorded = { kind, inTransaction };
  recorded.push(entry);
  const chain: Record<string, unknown> = {};
  for (const method of ['from', 'where', 'values', 'orderBy', 'limit', 'returning', 'for']) {
    chain[method] = () => chain;
  }
  chain.set = (values: Record<string, unknown>) => {
    entry.set = values;
    return chain;
  };
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return chain;
}

function makeDb(inTransaction: boolean) {
  return {
    select: () => builder('select', inTransaction, selectQueue.shift() ?? []),
    insert: () => builder('insert', inTransaction, [{ id: 'new-row', is_default: true }]),
    update: () => builder('update', inTransaction, [{ id: 'updated' }]),
    delete: () => builder('delete', inTransaction, []),
  };
}

const getDrizzleInstance = vi.fn(() => ({
  ...makeDb(false),
  transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(makeDb(true)),
}));

vi.mock('../../database/services/DrizzleService.js', () => ({ getDrizzleInstance }));

const query = vi.fn<(sql: string, params: unknown[]) => Promise<unknown[]>>();
const deleteStationery = vi.fn<(userId: string, fileName: string) => Promise<void>>();
const reportBackgroundError = vi.fn();
vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query }),
}));
vi.mock('./letterheadStationery.js', () => ({ deleteStationery }));
vi.mock('../../utils/reportBackgroundError.js', () => ({ reportBackgroundError }));

const { createLetterhead, deleteLetterhead, purgeLetterhead, updateLetterhead } =
  await import('./letterheadRepository.js');

beforeEach(() => {
  recorded.length = 0;
  selectQueue = [];
});

describe('createLetterhead', () => {
  it('makes the first letterhead the default without being asked', async () => {
    selectQueue = [[]]; // no letterhead yet

    await createLetterhead('user-1', { label: 'KV' });

    // No existing rows → no need to clear anything, but the insert must mark it.
    expect(recorded.filter((r) => r.kind === 'update')).toHaveLength(0);
    expect(recorded.some((r) => r.kind === 'insert' && r.inTransaction)).toBe(true);
  });

  it('does not steal the default from an existing letterhead', async () => {
    selectQueue = [[{ id: 'lh-1' }]];

    await createLetterhead('user-1', { label: 'Zweiter' });

    expect(recorded.filter((r) => r.kind === 'update')).toHaveLength(0);
  });

  it('clears the previous default when the new one claims it', async () => {
    selectQueue = [[{ id: 'lh-1' }]];

    await createLetterhead('user-1', { label: 'Zweiter', is_default: true });

    const update = recorded.find((r) => r.kind === 'update');
    expect(update).toBeDefined();
    // Clearing and inserting must be one unit — otherwise two parallel requests
    // can both hold is_default and trip the partial unique index.
    expect(update!.inTransaction).toBe(true);
  });

  it('runs the count and the insert in one transaction', async () => {
    selectQueue = [[]];
    await createLetterhead('user-1', { label: 'KV' });

    expect(recorded.every((r) => r.inTransaction)).toBe(true);
  });
});

describe('updateLetterhead', () => {
  it('clears the other defaults only when promoting', async () => {
    await updateLetterhead('user-1', 'lh-2', { label: 'Neuer Name' });
    expect(recorded.filter((r) => r.kind === 'update')).toHaveLength(1);

    recorded.length = 0;
    await updateLetterhead('user-1', 'lh-2', { is_default: true });
    // One update clears the others, one writes the row itself.
    expect(recorded.filter((r) => r.kind === 'update')).toHaveLength(2);
  });

  it('keeps both statements in the same transaction', async () => {
    await updateLetterhead('user-1', 'lh-2', { is_default: true });

    expect(recorded.every((r) => r.inTransaction)).toBe(true);
  });
});

describe('deleteLetterhead (into the Papierkorb)', () => {
  const trashUpdate = () => recorded.find((r) => r.kind === 'update' && r.set?.deleted_at);

  it('reports a miss without touching anything else', async () => {
    selectQueue = [[]];

    await expect(deleteLetterhead('user-1', 'nope')).resolves.toBe(false);
    expect(recorded.filter((r) => r.kind === 'update')).toHaveLength(0);
  });

  it('only sets deleted_at and gives up is_default — no DELETE, the file stays', async () => {
    selectQueue = [[{ is_default: false }]];

    await expect(deleteLetterhead('user-1', 'lh-2')).resolves.toBe(true);

    expect(recorded.some((r) => r.kind === 'delete')).toBe(false);
    expect(trashUpdate()?.set).toMatchObject({ deleted_at: expect.any(Date), is_default: false });
    expect(deleteStationery).not.toHaveBeenCalled();
  });

  it('promotes the next letterhead when the default is deleted', async () => {
    selectQueue = [[{ is_default: true }], [{ id: 'lh-2' }]];

    await expect(deleteLetterhead('user-1', 'lh-1')).resolves.toBe(true);

    // Without this the export would silently lose its preselection.
    const updates = recorded.filter((r) => r.kind === 'update');
    expect(updates).toHaveLength(2);
    expect(updates[1]?.set).toMatchObject({ is_default: true });
    expect(recorded.every((r) => r.inTransaction)).toBe(true);
  });

  it('does not promote when a non-default is deleted', async () => {
    selectQueue = [[{ is_default: false }], [{ id: 'lh-1' }]];

    await deleteLetterhead('user-1', 'lh-2');

    expect(recorded.filter((r) => r.kind === 'update')).toHaveLength(1);
  });

  it('survives deleting the last letterhead', async () => {
    selectQueue = [[{ is_default: true }], []];

    await expect(deleteLetterhead('user-1', 'lh-1')).resolves.toBe(true);
    expect(recorded.filter((r) => r.kind === 'update')).toHaveLength(1);
  });
});

describe('purgeLetterhead', () => {
  const ID = '33333333-3333-4333-8333-333333333333';
  const effects: string[] = [];

  beforeEach(() => {
    effects.length = 0;
    query.mockReset();
    reportBackgroundError.mockClear();
    deleteStationery.mockReset().mockImplementation((userId, fileName) => {
      effects.push(`rm ${userId}/${fileName}`);
      return Promise.resolve();
    });
  });

  function deletes(rows: unknown[]): void {
    query.mockImplementation((sql) => {
      effects.push(sql.replace(/\s+/g, ' ').trim().split(' WHERE ')[0]);
      return Promise.resolve(rows);
    });
  }

  it('deletes the trashed row conditionally, then its stationery file', async () => {
    deletes([{ id: ID, user_id: 'user-1', stationery_file: '1.pdf' }]);
    const cutoff = new Date('2026-08-30T00:00:00Z');

    await expect(purgeLetterhead(ID, cutoff)).resolves.toBe(true);

    const [sql, params] = query.mock.calls[0]!;
    expect(sql).toContain('deleted_at IS NOT NULL');
    expect(sql).toContain('deleted_at < $2');
    expect(params).toEqual([ID, cutoff]);
    expect(effects).toEqual(['DELETE FROM user_letterheads', 'rm user-1/1.pdf']);
  });

  it('touches no file when the row was restored meanwhile (0 rows)', async () => {
    deletes([]);
    await expect(purgeLetterhead(ID, null)).resolves.toBe(false);
    expect(deleteStationery).not.toHaveBeenCalled();
  });

  it('reports a failing file removal and never rethrows once the row is gone', async () => {
    deletes([{ id: ID, user_id: 'user-1', stationery_file: '1.pdf' }]);
    deleteStationery.mockRejectedValueOnce(new Error('EACCES'));

    await expect(purgeLetterhead(ID, null)).resolves.toBe(true);
    expect(reportBackgroundError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ job: 'trash-purge', kind: 'user_letterhead', id: ID })
    );
  });
});
