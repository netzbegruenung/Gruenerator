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
}

const recorded: Recorded[] = [];
/** Results handed to consecutive select() calls, in order. */
let selectQueue: Array<Array<{ id: string }>> = [];
let deleteReturns: Array<{ id: string; is_default: boolean }> = [];

/** Chainable stub — every builder method returns the thenable itself. */
function builder(kind: Recorded['kind'], inTransaction: boolean, result: unknown) {
  recorded.push({ kind, inTransaction });
  const chain: Record<string, unknown> = {};
  for (const method of ['from', 'where', 'set', 'values', 'orderBy', 'limit', 'returning']) {
    chain[method] = () => chain;
  }
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return chain;
}

function makeDb(inTransaction: boolean) {
  return {
    select: () => builder('select', inTransaction, selectQueue.shift() ?? []),
    insert: () => builder('insert', inTransaction, [{ id: 'new-row', is_default: true }]),
    update: () => builder('update', inTransaction, [{ id: 'updated' }]),
    delete: () => builder('delete', inTransaction, deleteReturns),
  };
}

const getDrizzleInstance = vi.fn(() => ({
  ...makeDb(false),
  transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(makeDb(true)),
}));

vi.mock('../../database/services/DrizzleService.js', () => ({ getDrizzleInstance }));

const { createLetterhead, deleteLetterhead, updateLetterhead } =
  await import('./letterheadRepository.js');

beforeEach(() => {
  recorded.length = 0;
  selectQueue = [];
  deleteReturns = [];
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

describe('deleteLetterhead', () => {
  it('reports a miss without touching anything else', async () => {
    deleteReturns = [];

    await expect(deleteLetterhead('user-1', 'nope')).resolves.toBe(false);
    expect(recorded.filter((r) => r.kind === 'update')).toHaveLength(0);
  });

  it('promotes the next letterhead when the default is deleted', async () => {
    deleteReturns = [{ id: 'lh-1', is_default: true }];
    selectQueue = [[{ id: 'lh-2' }]];

    await expect(deleteLetterhead('user-1', 'lh-1')).resolves.toBe(true);

    // Without this the export would silently lose its preselection.
    expect(recorded.filter((r) => r.kind === 'update')).toHaveLength(1);
    expect(recorded.every((r) => r.inTransaction)).toBe(true);
  });

  it('does not promote when a non-default is deleted', async () => {
    deleteReturns = [{ id: 'lh-2', is_default: false }];
    selectQueue = [[{ id: 'lh-1' }]];

    await deleteLetterhead('user-1', 'lh-2');

    expect(recorded.filter((r) => r.kind === 'update')).toHaveLength(0);
  });

  it('survives deleting the last letterhead', async () => {
    deleteReturns = [{ id: 'lh-1', is_default: true }];
    selectQueue = [[]];

    await expect(deleteLetterhead('user-1', 'lh-1')).resolves.toBe(true);
    expect(recorded.filter((r) => r.kind === 'update')).toHaveLength(0);
  });
});
