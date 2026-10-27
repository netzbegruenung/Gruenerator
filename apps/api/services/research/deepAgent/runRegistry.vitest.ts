import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn<(sql: string, params?: unknown[]) => Promise<unknown[]>>();

vi.mock('../../../database/services/PostgresService/index.js', () => ({
  getPostgresInstance: () => ({ query }),
}));

const {
  RETENTION_DAYS,
  STALE_AFTER_MINUTES,
  listResumableRuns,
  purgeExpiredRuns,
  recordRunFinished,
  recordRunStarted,
  recordRunState,
} = await import('./runRegistry.js');

beforeEach(() => {
  vi.clearAllMocks();
  query.mockResolvedValue([]);
});

/** The SQL a call produced, joined for substring assertions. */
function sqlOf(callIndex = 0): string {
  return String(query.mock.calls[callIndex]?.[0] ?? '');
}

describe('recording a run', () => {
  it('reuses the row when a research is continued', async () => {
    await recordRunStarted({ threadId: 't1', question: 'Wehrpflicht?', locale: 'de-DE' });

    // The thread id is the identity of the RESEARCH, not of the attempt — a
    // resume must not leave a second row behind.
    expect(sqlOf()).toContain('ON CONFLICT (thread_id) DO UPDATE');
  });

  /**
   * Caught a real one: the INSERT listed five columns but only four values,
   * because the locale placeholder was missing. The parameter assertion below
   * passed anyway — parameters and SQL are checked separately, so this counts
   * the placeholders against them.
   */
  it('passes as many placeholders as parameters', async () => {
    await recordRunStarted({ threadId: 't1', question: 'Wehrpflicht?', locale: 'de-DE' });

    const [sql, params] = query.mock.calls[0] ?? [];
    const placeholders = new Set(String(sql).match(/\$\d+/g) ?? []);
    expect(placeholders.size).toBe((params as unknown[]).length);
  });

  it('keeps a run without a user rather than dropping it', async () => {
    await recordRunStarted({ threadId: 't1', question: 'Wehrpflicht?', locale: 'de-DE' });

    expect(query.mock.calls[0]?.[1]).toEqual(['t1', null, 'Wehrpflicht?', 'de-DE']);
  });

  it('closes the row with what actually happened', async () => {
    await recordRunFinished({ threadId: 't1', status: 'finished', partial: true });

    expect(query.mock.calls[0]?.[1]).toEqual(['t1', 'finished', true]);
  });

  /**
   * The registry is an aid to operations, not part of the result. A research
   * that ran for a quarter of an hour must not be lost because a bookkeeping
   * INSERT hit a dead pool.
   */
  it('never throws, whatever the database does', async () => {
    query.mockRejectedValue(new Error('connection terminated'));

    await expect(
      recordRunStarted({ threadId: 't1', question: 'x', locale: 'de-DE' })
    ).resolves.toBeUndefined();
    await expect(recordRunFinished({ threadId: 't1', status: 'failed' })).resolves.toBeUndefined();
  });
});

describe('listResumableRuns', () => {
  /**
   * A live run is also `running`. The age is what separates "someone is
   * streaming this right now" from "this died with its process" — the whole
   * budget is 15 minutes, so anything past the stale mark cannot be live.
   */
  it('only offers runs too old to still be live', async () => {
    await listResumableRuns();

    expect(sqlOf()).toContain("status = 'running'");
    expect(sqlOf()).toContain('minutes');
    expect(query.mock.calls[0]?.[1]).toEqual([String(STALE_AFTER_MINUTES), 20]);
  });

  it('answers with an empty list when the query fails', async () => {
    query.mockRejectedValue(new Error('weg'));

    expect(await listResumableRuns()).toEqual([]);
  });
});

describe('recordRunState', () => {
  it('overwrites the one state the row carries', async () => {
    const state = {
      messages: [{ role: 'user' as const, content: 'Frage' }],
      workspace: { todos: [], files: {} },
    };
    await recordRunState('t1', state);

    expect(sqlOf()).toContain('UPDATE deep_research_runs SET state');
    expect(query.mock.calls[0]?.[1]).toEqual(['t1', JSON.stringify(state)]);
  });

  it('never throws, whatever the database does', async () => {
    query.mockRejectedValueOnce(new Error('connection refused'));
    await expect(
      recordRunState('t1', { messages: [], workspace: { todos: [], files: {} } })
    ).resolves.toBeUndefined();
  });
});

describe('purgeExpiredRuns', () => {
  it('drops expired rows, state included, in one statement', async () => {
    query.mockResolvedValueOnce([{ thread_id: 't1' }, { thread_id: 't2' }]);

    expect(await purgeExpiredRuns()).toBe(2);
    expect(sqlOf()).toContain('DELETE FROM deep_research_runs');
  });

  it('uses the retention age it documents', async () => {
    await purgeExpiredRuns();

    expect(query.mock.calls[0]?.[1]).toEqual([String(RETENTION_DAYS)]);
  });

  it('reports nothing when the sweep fails', async () => {
    query.mockRejectedValueOnce(new Error('deadlock detected'));
    expect(await purgeExpiredRuns()).toBe(0);
  });

  it('does nothing when nothing is expired', async () => {
    expect(await purgeExpiredRuns()).toBe(0);
  });
});
