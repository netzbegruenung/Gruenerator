import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  _resetModelHealthForTests,
  modelHealthSnapshot,
  recordModelSample,
} from './modelHealth.js';
import { flushModelLatency, primeModelBaselines } from './modelLatencyStore.js';

const values = vi
  .fn()
  .mockReturnValue({ onConflictDoUpdate: vi.fn().mockResolvedValue(undefined) });
const selectRows: Array<{ provider: string; model: string; rate: number | null }> = [];

vi.mock('../../database/services/DrizzleService.js', () => ({
  getDrizzleInstance: () => ({
    insert: () => ({ values }),
    select: () => ({
      from: () => ({ where: () => ({ groupBy: () => Promise.resolve(selectRows) }) }),
    }),
  }),
}));

describe('modelLatencyStore', () => {
  beforeEach(() => {
    _resetModelHealthForTests();
    values.mockClear();
    selectRows.length = 0;
  });

  it('schreibt ein Fenster und leert die Zähler', async () => {
    for (let i = 0; i < 3; i++) {
      recordModelSample({
        provider: 'cortecs',
        model: 'gemma-4-31b-it',
        outputTokens: 200,
        durationMs: 2500,
        ttftMs: 300,
      });
    }

    await flushModelLatency();

    const written = values.mock.calls[0]?.[0] as Array<Record<string, unknown>>;
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({
      provider: 'cortecs',
      model: 'gemma-4-31b-it',
      samples: 3,
      p50TtftMs: 300,
    });
    expect(modelHealthSnapshot()).toEqual([]);
  });

  it('schreibt nichts, wenn nichts gemessen wurde', async () => {
    await flushModelLatency();
    expect(values).not.toHaveBeenCalled();
  });

  it('wärmt die Basislinie vor, sodass das erste zähe Paar sofort auffällt', async () => {
    selectRows.push({ provider: 'cortecs', model: 'gemma-4-31b-it', rate: 76 });
    await primeModelBaselines();

    // Zwei Proben mit 3,7 tok/s — ohne Vorwärmung wären das die ersten beiden
    // Bausteine der Basislinie und kein Verdikt.
    for (let i = 0; i < 2; i++) {
      recordModelSample({
        provider: 'cortecs',
        model: 'gemma-4-31b-it',
        outputTokens: 200,
        durationMs: 54_000,
      });
    }
    expect(modelHealthSnapshot()[0]?.isSlow).toBe(true);
  });
});
