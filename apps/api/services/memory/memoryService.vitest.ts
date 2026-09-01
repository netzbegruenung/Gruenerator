/**
 * The service rules against an in-memory store: dedup, the caps, ownership,
 * and that a failing vector mirror never loses the Postgres row.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  createMemoryService,
  MAX_MEMORIES_PER_USER,
  MAX_TOTAL_CHARS,
  MemoryRejectedError,
} from './memoryService.js';
import { normalizeMemoryText, type MemoryDb, type MemoryVectors } from './memoryStore.js';

import type { UserMemoryRow } from '../../database/schema/index.js';

function fakeDb(seed: UserMemoryRow[] = []): MemoryDb & { rows: UserMemoryRow[] } {
  const rows = [...seed];
  let n = rows.length;
  return {
    rows,
    async list(userId) {
      return rows.filter((r) => r.user_id === userId);
    },
    async findByText(userId, normalized) {
      return (
        rows.find((r) => r.user_id === userId && normalizeMemoryText(r.text) === normalized) ?? null
      );
    },
    async insert(row) {
      const inserted: UserMemoryRow = {
        id: `m${++n}`,
        user_id: row.userId,
        kind: row.kind,
        text: row.text,
        source: row.source,
        thread_id: row.threadId,
        created_at: new Date(),
        updated_at: new Date(),
      };
      rows.push(inserted);
      return inserted;
    },
    async update(userId, id, text) {
      const r = rows.find((x) => x.id === id && x.user_id === userId);
      if (!r) return null;
      r.text = text;
      return r;
    },
    async remove(userId, id) {
      const i = rows.findIndex((x) => x.id === id && x.user_id === userId);
      if (i < 0) return null;
      return rows.splice(i, 1)[0];
    },
    async removeAll(userId) {
      const before = rows.length;
      for (let i = rows.length - 1; i >= 0; i--) if (rows[i].user_id === userId) rows.splice(i, 1);
      return before - rows.length;
    },
  };
}

function fakeVectors(over: Partial<MemoryVectors> = {}): MemoryVectors {
  return {
    upsert: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    removeAll: vi.fn(async () => {}),
    search: vi.fn(async () => []),
    ...over,
  };
}

const input = (text: string, kind: 'anweisung' | 'fakt' = 'fakt') => ({
  userId: 'u1',
  kind,
  text,
  source: 'chat' as const,
  threadId: null,
});

describe('memoryService.create', () => {
  it('returns the existing row for an exact duplicate (case/whitespace-insensitive)', async () => {
    const db = fakeDb();
    const svc = createMemoryService({ db, vectors: fakeVectors() });
    const first = await svc.create(input('Schreibt für den KV Köln.'));
    const second = await svc.create(input('  schreibt   für den kv köln. '));
    expect(second.duplicate).toBe(true);
    expect(second.row.id).toBe(first.row.id);
    expect(db.rows).toHaveLength(1);
  });

  it('mirrors facts to the vector store but never instructions', async () => {
    const vectors = fakeVectors();
    const svc = createMemoryService({ db: fakeDb(), vectors });
    await svc.create(input('Immer Du-Form.', 'anweisung'));
    expect(vectors.upsert).not.toHaveBeenCalled();
    await svc.create(input('Aus Köln.', 'fakt'));
    expect(vectors.upsert).toHaveBeenCalledTimes(1);
  });

  it('keeps the row when the vector mirror fails', async () => {
    const db = fakeDb();
    const vectors = fakeVectors({
      upsert: vi.fn(async () => {
        throw new Error('qdrant down');
      }),
    });
    const svc = createMemoryService({ db, vectors });
    const { row } = await svc.create(input('Aus Köln.'));
    expect(db.rows.map((r) => r.id)).toContain(row.id);
  });

  it('rejects the 61st memory and a write past the total character cap', async () => {
    const db = fakeDb();
    const svc = createMemoryService({ db, vectors: fakeVectors() });
    for (let i = 0; i < MAX_MEMORIES_PER_USER; i++) await svc.create(input(`Fakt ${i}.`));
    await expect(svc.create(input('Noch einer.'))).rejects.toBeInstanceOf(MemoryRejectedError);

    const db2 = fakeDb();
    const svc2 = createMemoryService({ db: db2, vectors: fakeVectors() });
    const big = 'x'.repeat(400);
    for (let i = 0; i < Math.floor(MAX_TOTAL_CHARS / 400); i++)
      await svc2.create(input(`${big.slice(0, 398)}${i.toString().padStart(2, '0')}`));
    await expect(svc2.create(input('Einer zu viel.'))).rejects.toMatchObject({ reason: 'full' });
  });

  it('rejects empty and over-long text before touching the store', async () => {
    const db = fakeDb();
    const svc = createMemoryService({ db, vectors: fakeVectors() });
    await expect(svc.create(input('   '))).rejects.toMatchObject({ reason: 'text' });
    await expect(svc.create(input('y'.repeat(401)))).rejects.toMatchObject({ reason: 'text' });
    expect(db.rows).toHaveLength(0);
  });
});

describe('memoryService.update budget', () => {
  it('rejects an edit that would push the total past the cap, but allows shrinking or same-size edits', async () => {
    const db = fakeDb();
    const svc = createMemoryService({ db, vectors: fakeVectors() });
    // 25 rows × 320 chars = exactly the cap. One row growing to 400 chars
    // would exceed it — legal per row, illegal in aggregate.
    const rowText = (i: number) => `${'x'.repeat(318)}${i.toString().padStart(2, '0')}`;
    const created: string[] = [];
    for (let i = 0; i < MAX_TOTAL_CHARS / 320; i++) {
      created.push((await svc.create(input(rowText(i)))).row.id);
    }
    await expect(svc.update('u1', created[0], 'y'.repeat(400))).rejects.toMatchObject({
      reason: 'full',
    });
    // Same length passes: the row's OLD length must not be counted on top of
    // the new one. Shorter passes too.
    const sameLength = 'z'.repeat(320);
    await expect(svc.update('u1', created[0], sameLength)).resolves.toMatchObject({
      text: sameLength,
    });
    await expect(svc.update('u1', created[0], 'kurz.')).resolves.toMatchObject({ text: 'kurz.' });
  });
});

describe('memoryService ownership', () => {
  it('update/remove return null for another person’s row and touch no vector', async () => {
    const db = fakeDb();
    const vectors = fakeVectors();
    const svc = createMemoryService({ db, vectors });
    const { row } = await svc.create(input('Aus Köln.'));
    expect(await svc.update('u2', row.id, 'Aus Bonn.')).toBeNull();
    expect(await svc.remove('u2', row.id)).toBeNull();
    expect(db.rows[0].text).toBe('Aus Köln.');
    expect(vectors.remove).not.toHaveBeenCalled();
  });

  it('removeAll clears rows and asks the vector store to sweep the person', async () => {
    const db = fakeDb();
    const vectors = fakeVectors();
    const svc = createMemoryService({ db, vectors });
    await svc.create(input('A.'));
    await svc.create(input('B.', 'anweisung'));
    expect(await svc.removeAll('u1')).toBe(2);
    expect(vectors.removeAll).toHaveBeenCalledWith('u1');
  });
});
