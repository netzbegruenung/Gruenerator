/**
 * Der Purge-Worker löscht endgültig. Diese Tests halten fest, dass ein
 * Fehler bei einem Eintrag den Lauf nicht beendet, dass der Probelauf nichts
 * anfasst und dass der Stichtag aus der Aufbewahrungsfrist kommt.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const reportBackgroundError = vi.fn();

function handler() {
  return { listExpired: vi.fn(), purge: vi.fn() };
}
const kinds = { chat_thread: handler(), notebook: handler() };

vi.mock('./trashRegistry.js', () => ({
  TRASH_KINDS: kinds,
  TRASH_RETENTION_DAYS: 30,
}));
vi.mock('../../utils/reportBackgroundError.js', () => ({
  reportBackgroundError: (...args: unknown[]) => reportBackgroundError(...args),
}));

const { purgeExpiredTrash, PER_KIND_BATCH } = await import('./trashPurgeService.js');

const NOW = new Date('2026-09-29T12:00:00.000Z');
const CUTOFF = new Date('2026-08-30T12:00:00.000Z');

function expiredIds(ids: string[]) {
  return ids.map((id) => ({ id, userId: 'u1' }));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  reportBackgroundError.mockReset();
  for (const h of Object.values(kinds)) {
    h.listExpired.mockReset().mockResolvedValue([]);
    h.purge.mockReset().mockResolvedValue(true);
  }
});

afterEach(() => {
  vi.useRealTimers();
});

describe('purgeExpiredTrash', () => {
  it('fragt jede Art mit dem Stichtag aus der Frist und dem Batch-Deckel', async () => {
    await purgeExpiredTrash(true);

    expect(PER_KIND_BATCH).toBe(200);
    for (const h of Object.values(kinds)) {
      expect(h.listExpired).toHaveBeenCalledWith(CUTOFF, 200);
    }
  });

  it('reicht den Stichtag an purge weiter und zählt nur echte Löschungen', async () => {
    kinds.chat_thread.listExpired.mockResolvedValue(expiredIds(['a', 'b']));
    kinds.chat_thread.purge.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    const report = await purgeExpiredTrash(true);

    expect(kinds.chat_thread.purge).toHaveBeenCalledWith('a', CUTOFF);
    expect(kinds.chat_thread.purge).toHaveBeenCalledWith('b', CUTOFF);
    expect(report.find((r) => r.kind === 'chat_thread')).toEqual({
      kind: 'chat_thread',
      found: 2,
      purged: 1,
      failed: 0,
    });
  });

  it('ein fehlschlagender purge stoppt den Lauf nicht und wird gemeldet', async () => {
    const boom = new Error('boom');
    kinds.chat_thread.listExpired.mockResolvedValue(expiredIds(['a', 'b']));
    kinds.chat_thread.purge.mockRejectedValueOnce(boom).mockResolvedValueOnce(true);
    kinds.notebook.listExpired.mockResolvedValue(expiredIds(['n1']));

    const report = await purgeExpiredTrash(true);

    expect(reportBackgroundError).toHaveBeenCalledWith(boom, {
      job: 'trash-purge',
      kind: 'chat_thread',
      id: 'a',
    });
    expect(kinds.chat_thread.purge).toHaveBeenCalledWith('b', CUTOFF);
    expect(kinds.notebook.purge).toHaveBeenCalledWith('n1', CUTOFF);
    expect(report).toEqual([
      { kind: 'chat_thread', found: 2, purged: 1, failed: 1 },
      { kind: 'notebook', found: 1, purged: 1, failed: 0 },
    ]);
  });

  it('eine Art, deren Liste scheitert, hält die anderen nicht auf', async () => {
    const boom = new Error('db down');
    kinds.chat_thread.listExpired.mockRejectedValue(boom);
    kinds.notebook.listExpired.mockResolvedValue(expiredIds(['n1']));

    const report = await purgeExpiredTrash(true);

    expect(reportBackgroundError).toHaveBeenCalledWith(boom, {
      job: 'trash-purge',
      kind: 'chat_thread',
    });
    expect(kinds.notebook.purge).toHaveBeenCalledWith('n1', CUTOFF);
    expect(report[0]).toEqual({ kind: 'chat_thread', found: 0, purged: 0, failed: 1 });
  });

  it('der Probelauf ist der Standard und ruft kein purge', async () => {
    kinds.chat_thread.listExpired.mockResolvedValue(expiredIds(['a', 'b']));

    const report = await purgeExpiredTrash();

    expect(kinds.chat_thread.purge).not.toHaveBeenCalled();
    expect(kinds.notebook.purge).not.toHaveBeenCalled();
    expect(report[0]).toEqual({ kind: 'chat_thread', found: 2, purged: 0, failed: 0 });
  });
});
