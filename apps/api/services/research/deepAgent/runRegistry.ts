/**
 * What makes a checkpoint findable, and what makes it disposable.
 *
 * The checkpointer writes a run's state under a `thread_id` and nothing else —
 * not whose run it was, not what it was about, not whether it ever produced a
 * report. On its own that is write-only storage: a run that dies in a deploy
 * leaves rows nobody can identify, and nothing says when they may go.
 *
 * This module is the other half. One row per run, opened at the start and
 * closed at the end, so two questions can be answered:
 *
 *  - **Which runs are still open?** Rows left `running` past a restart — the
 *    ones a resume would target.
 *  - **What may be deleted?** Rows past the retention age, together with the
 *    checkpoint state behind them.
 *
 * Every function fails soft. A research run must not die because its
 * bookkeeping did — the registry is an aid to operations, not part of the
 * result. That mirrors `checkpointer.ts`, which returns null rather than
 * throwing for the same reason.
 */

import { getPostgresInstance } from '../../../database/services/PostgresService/index.js';
import { createLogger } from '../../../utils/logger.js';

import { getCheckpointer } from './checkpointer.js';

import type { DeepResearchRun, DeepResearchRunStatus } from '../../../database/schema/index.js';

const log = createLogger('DeepResearchRegistry');

/**
 * How long a run's state is kept.
 *
 * Measured on 12.08.2026: ~536 kB of checkpoint per run (60 steps, a state
 * growing to ~576 kB). At 100 runs a day that is ~52 MB/day, so an unbounded
 * schema reaches double-digit gigabytes within a year.
 *
 * Seven days rather than one: the point of keeping state is surviving a deploy
 * or a crash, and nobody looks at a failed research the same hour. A week
 * survives a weekend and still bounds the schema at roughly a third of a
 * gigabyte in the worst case above.
 */
export const RETENTION_DAYS = 7;

/**
 * A run older than this cannot still be running — the whole budget is 15
 * minutes. Anything past it that still says `running` was killed with its
 * process, which is exactly what makes it a resume candidate rather than a
 * live run someone else is streaming.
 */
export const STALE_AFTER_MINUTES = 30;

async function run<T>(what: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    log.warn(`[Registry] ${what} fehlgeschlagen: ${String(error)}`);
    return null;
  }
}

/** Opens the row. Called before the agent starts. */
export async function recordRunStarted(params: {
  threadId: string;
  question: string;
  locale: string;
  userId?: string;
}): Promise<void> {
  await run('Lauf eintragen', async () => {
    await getPostgresInstance().query(
      `INSERT INTO deep_research_runs (thread_id, user_id, question, locale, status)
       VALUES ($1, $2, $3, $4, 'running')
       ON CONFLICT (thread_id) DO UPDATE
         SET status = 'running', finished_at = NULL`,
      [params.threadId, params.userId ?? null, params.question, params.locale]
    );
  });
}

/**
 * Closes the row.
 *
 * `ON CONFLICT` above plus this makes a resumed run reuse its row rather than
 * accumulating one per attempt — the thread id is the identity of the
 * research, not of the attempt.
 */
export async function recordRunFinished(params: {
  threadId: string;
  status: Exclude<DeepResearchRunStatus, 'running'>;
  partial?: boolean;
}): Promise<void> {
  await run('Lauf abschließen', async () => {
    await getPostgresInstance().query(
      `UPDATE deep_research_runs
          SET status = $2, partial = $3, finished_at = NOW()
        WHERE thread_id = $1`,
      [params.threadId, params.status, params.partial ?? false]
    );
  });
}

/** Links a finished run to the document its report became. */
export async function recordRunDocument(threadId: string, documentId: string): Promise<void> {
  await run('Dokument verknüpfen', async () => {
    await getPostgresInstance().query(
      `UPDATE deep_research_runs SET document_id = $2 WHERE thread_id = $1`,
      [threadId, documentId]
    );
  });
}

/**
 * Runs that were killed with their process — open, and too old to still be
 * live. Newest first, because a resume is worth most while the question still
 * matters to someone.
 */
export async function listResumableRuns(limit = 20): Promise<DeepResearchRun[]> {
  const rows = await run('Offene Läufe lesen', async () =>
    getPostgresInstance().query<DeepResearchRun>(
      `SELECT * FROM deep_research_runs
        WHERE status = 'running'
          AND started_at < NOW() - ($1 || ' minutes')::interval
        ORDER BY started_at DESC
        LIMIT $2`,
      [String(STALE_AFTER_MINUTES), limit]
    )
  );
  return rows ?? [];
}

export async function getRun(threadId: string): Promise<DeepResearchRun | null> {
  const rows = await run('Lauf lesen', async () =>
    getPostgresInstance().query<DeepResearchRun>(
      `SELECT * FROM deep_research_runs WHERE thread_id = $1`,
      [threadId]
    )
  );
  return rows?.[0] ?? null;
}

/**
 * Drops registry rows and the checkpoint state behind them.
 *
 * The order matters and it is the safe one: `deleteThread` first, the row
 * second. A crash in between leaves a row whose state is gone — harmless, the
 * next pass deletes it — whereas the reverse would leave orphaned checkpoint
 * blobs that nothing knows about any more, which is precisely the unbounded
 * growth this exists to prevent.
 *
 * `deleteThread` is the saver's own API rather than a DELETE against its
 * tables: the four tables are its to migrate, and reaching into them from here
 * would break the next time it changes them.
 */
export async function purgeExpiredRuns(retentionDays = RETENTION_DAYS): Promise<number> {
  const expired = await run('Abgelaufene Läufe lesen', async () =>
    getPostgresInstance().query<{ thread_id: string }>(
      `SELECT thread_id FROM deep_research_runs
        WHERE started_at < NOW() - ($1 || ' days')::interval`,
      [String(retentionDays)]
    )
  );
  if (!expired || expired.length === 0) return 0;

  const checkpointer = await getCheckpointer();
  let purged = 0;
  for (const { thread_id: threadId } of expired) {
    const done = await run(`Checkpoints von ${threadId} löschen`, async () => {
      if (checkpointer) await checkpointer.deleteThread(threadId);
      await getPostgresInstance().query(`DELETE FROM deep_research_runs WHERE thread_id = $1`, [
        threadId,
      ]);
      return true;
    });
    if (done) purged += 1;
  }
  if (purged > 0)
    log.info(`[Registry] ${purged} abgelaufene Läufe entfernt (> ${retentionDays} d)`);
  return purged;
}
