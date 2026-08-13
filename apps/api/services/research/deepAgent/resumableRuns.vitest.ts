import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const purgeExpiredRuns = vi.fn<() => Promise<number>>();
const listResumableRuns = vi.fn<() => Promise<unknown[]>>();

vi.mock('./runRegistry.js', () => ({
  purgeExpiredRuns: () => purgeExpiredRuns(),
  listResumableRuns: () => listResumableRuns(),
  RETENTION_DAYS: 7,
}));

const { describeResumableRuns, startDeepResearchCleanup, stopDeepResearchCleanup } =
  await import('./resumableRuns.js');

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  purgeExpiredRuns.mockResolvedValue(0);
  listResumableRuns.mockResolvedValue([]);
});

afterEach(() => {
  stopDeepResearchCleanup();
  vi.useRealTimers();
});

describe('startDeepResearchCleanup', () => {
  /**
   * A deploy restarts every instance at once. Sweeping at boot would fire a
   * synchronised DELETE storm across all of them at the single moment the
   * database least needs it.
   */
  it('does not sweep at boot', () => {
    startDeepResearchCleanup();

    expect(purgeExpiredRuns).not.toHaveBeenCalled();
  });

  it('sweeps on the interval', async () => {
    startDeepResearchCleanup();

    await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000);

    expect(purgeExpiredRuns).toHaveBeenCalledTimes(1);
  });

  it('starts one sweeper, however often it is called', async () => {
    // server.ts calls this from two places (dev worker, production master) and
    // the file is imported by both paths — a second interval would double every
    // sweep.
    startDeepResearchCleanup();
    startDeepResearchCleanup();

    await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000);

    expect(purgeExpiredRuns).toHaveBeenCalledTimes(1);
  });

  it('survives a failing sweep instead of taking the process with it', async () => {
    purgeExpiredRuns.mockRejectedValue(new Error('deadlock detected'));
    startDeepResearchCleanup();

    await vi.advanceTimersByTimeAsync(12 * 60 * 60 * 1000);

    // Second tick still ran: an unhandled rejection here would end the master
    // process, and with it every worker.
    expect(purgeExpiredRuns).toHaveBeenCalledTimes(2);
  });
});

describe('describeResumableRuns', () => {
  it('says how old a run is, because that is the decision', async () => {
    const started = new Date(Date.now() - 90 * 60_000).toISOString();
    listResumableRuns.mockResolvedValue([
      {
        thread_id: 'research-1',
        question: 'Wie steht die Partei zur Wehrpflicht?',
        started_at: started,
      },
    ]);

    const [line] = await describeResumableRuns();

    expect(line).toContain('research-1');
    expect(line).toContain('90 min alt');
    expect(line).toContain('Wehrpflicht');
  });

  it('says nothing when nothing is open', async () => {
    expect(await describeResumableRuns()).toEqual([]);
  });
});
