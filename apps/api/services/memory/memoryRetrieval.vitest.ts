import { describe, expect, it, vi } from 'vitest';

import { FACT_INLINE_LIMIT, FACT_SEARCH_LIMIT, loadTurnMemories } from './memoryRetrieval.js';

import type { UserMemoryRow } from '../../database/schema/index.js';

function rows(facts: number, instructions = 1): UserMemoryRow[] {
  const mk = (id: string, kind: 'anweisung' | 'fakt', i: number): UserMemoryRow => ({
    id,
    user_id: 'u1',
    kind,
    text: `${kind} ${i}`,
    source: 'chat',
    thread_id: null,
    created_at: new Date(2026, 0, i + 1),
    updated_at: new Date(2026, 0, i + 1),
  });
  return [
    ...Array.from({ length: instructions }, (_, i) => mk(`a${i}`, 'anweisung', i)),
    ...Array.from({ length: facts }, (_, i) => mk(`f${i}`, 'fakt', i)),
  ];
}

describe('loadTurnMemories', () => {
  it('injects every fact without searching while there are few', async () => {
    const search = vi.fn(async () => []);
    const turn = await loadTurnMemories('u1', 'egal', {
      list: async () => rows(FACT_INLINE_LIMIT),
      search,
    });
    expect(turn.fakten).toHaveLength(FACT_INLINE_LIMIT);
    expect(turn.anweisungen).toHaveLength(1);
    expect(search).not.toHaveBeenCalled();
  });

  it('searches above the inline limit and keeps the search order', async () => {
    const search = vi.fn(async () => ['f7', 'f2']);
    const turn = await loadTurnMemories('u1', 'Köln', { list: async () => rows(20), search });
    expect(search).toHaveBeenCalledWith('u1', 'Köln', FACT_SEARCH_LIMIT);
    expect(turn.fakten.map((r) => r.id)).toEqual(['f7', 'f2']);
    expect(turn.anweisungen).toHaveLength(1);
  });

  it('falls back to the most recent facts when the search throws or finds nothing', async () => {
    const throwing = vi.fn(async () => {
      throw new Error('qdrant down');
    });
    const t1 = await loadTurnMemories('u1', 'Köln', {
      list: async () => rows(20),
      search: throwing,
    });
    expect(t1.fakten.map((r) => r.id)).toEqual([
      'f12',
      'f13',
      'f14',
      'f15',
      'f16',
      'f17',
      'f18',
      'f19',
    ]);

    const empty = vi.fn(async () => []);
    const t2 = await loadTurnMemories('u1', 'Köln', { list: async () => rows(20), search: empty });
    expect(t2.fakten).toHaveLength(FACT_SEARCH_LIMIT);
  });

  it('does not embed an empty question', async () => {
    const search = vi.fn(async () => []);
    const turn = await loadTurnMemories('u1', '   ', { list: async () => rows(20), search });
    expect(search).not.toHaveBeenCalled();
    expect(turn.fakten).toHaveLength(FACT_SEARCH_LIMIT);
  });
});
