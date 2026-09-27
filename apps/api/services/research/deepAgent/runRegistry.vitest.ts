import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn<(sql: string, params?: unknown[]) => Promise<unknown[]>>();
const deleteThread = vi.fn<(threadId: string) => Promise<void>>();
let checkpointer: unknown = null;

vi.mock('../../../database/services/PostgresService/index.js', () => ({
  getPostgresInstance: () => ({ query }),
}));
vi.mock('./checkpointer.js', () => ({
  getCheckpointer: () => Promise.resolve(checkpointer),
}));

const {
  RETENTION_DAYS,
  STALE_AFTER_MINUTES,
  listResumableRuns,
  purgeExpiredRuns,
  recordRunFinished,
  recordRunStarted,
} = await import('./runRegistry.js');

beforeEach(() => {
  vi.clearAllMocks();
  query.mockResolvedValue([]);
  checkpointer = { deleteThread };
  deleteThread.mockResolvedValue();
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

describe('purgeExpiredRuns', () => {
  it('deletes the state through the saver, then the row', async () => {
    query.mockResolvedValueOnce([{ thread_id: 't1' }]).mockResolvedValue([]);

    expect(await purgeExpiredRuns()).toBe(1);

    // Order is load-bearing: state first, row second. A crash in between leaves
    // a row whose state is gone — the next pass cleans it. The reverse would
    // leave checkpoint blobs nothing knows about, which is the unbounded growth
    // this exists to prevent.
    expect(deleteThread).toHaveBeenCalledWith('t1');
    expect(sqlOf(1)).toContain('DELETE FROM deep_research_runs');
  });

  it('uses the retention age it documents', async () => {
    await purgeExpiredRuns();

    expect(query.mock.calls[0]?.[1]).toEqual([String(RETENTION_DAYS)]);
  });

  it('still drops the row when there is no checkpointer', async () => {
    // Runs recorded while Postgres was out of reach have no state to delete —
    // their rows must not become immortal because of it.
    checkpointer = null;
    query.mockResolvedValueOnce([{ thread_id: 't1' }]).mockResolvedValue([]);

    expect(await purgeExpiredRuns()).toBe(1);
    expect(sqlOf(1)).toContain('DELETE FROM deep_research_runs');
  });

  it('keeps going when one thread cannot be deleted', async () => {
    query.mockResolvedValueOnce([{ thread_id: 't1' }, { thread_id: 't2' }]).mockResolvedValue([]);
    deleteThread.mockRejectedValueOnce(new Error('deadlock detected'));

    // One stuck thread must not stop the sweep — it would stop retention
    // altogether, and the schema grows from there.
    expect(await purgeExpiredRuns()).toBe(1);
    expect(deleteThread).toHaveBeenCalledTimes(2);
  });

  it('does nothing when nothing is expired', async () => {
    expect(await purgeExpiredRuns()).toBe(0);
    expect(deleteThread).not.toHaveBeenCalled();
  });
});
