/**
 * Where a research run is recorded, and where its state is kept.
 *
 * One row per run, opened at the start and closed at the end, plus the run's
 * state (message history, plan, files) saved after every step of the lead, so
 * two questions can be answered:
 *
 *  - **Which runs are still open?** Rows left `running` past a restart — the
 *    ones `resume-research` can continue from their saved state.
 *  - **What may be deleted?** Rows past the retention age, state included.
 *
 * Every function fails soft. A research run must not die because its
 * bookkeeping did — the registry is an aid to operations, not part of the
 * result.
 */

import { getPostgresInstance } from '../../../database/services/PostgresService/index.js';
import { createLogger } from '../../../utils/logger.js';

import type { SavedRunState } from './types.js';
import type { DeepResearchRun, DeepResearchRunStatus } from '../../../database/schema/index.js';

const log = createLogger('DeepResearchRegistry');

/**
 * How long a run's state is kept.
 *
 * One row per run, overwritten after each step, so the state costs about one
 * history's worth — a few hundred kilobytes for a long run. Under the
 * LangGraph checkpointer it was every step's snapshot (~536 kB per run,
 * measured 12.08.2026), which is what the retention was first sized for.
 *
 * Seven days rather than one: the point of keeping state is surviving a deploy
 * or a crash, and nobody looks at a failed research the same hour. A week
 * survives a weekend.
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
 * Saves the run's state after a step. Overwrites the previous one — only the
 * latest state is ever resumed from.
 */
export async function recordRunState(threadId: string, state: SavedRunState): Promise<void> {
  await run('Zustand sichern', async () => {
    await getPostgresInstance().query(
      `UPDATE deep_research_runs SET state = $2::jsonb WHERE thread_id = $1`,
      [threadId, JSON.stringify(state)]
    );
  });
}

/** Drops registry rows past the retention age, and with them their state. */
export async function purgeExpiredRuns(retentionDays = RETENTION_DAYS): Promise<number> {
  const rows = await run('Abgelaufene Läufe löschen', async () =>
    getPostgresInstance().query<{ thread_id: string }>(
      `DELETE FROM deep_research_runs
        WHERE started_at < NOW() - ($1 || ' days')::interval
        RETURNING thread_id`,
      [String(retentionDays)]
    )
  );
  const purged = rows?.length ?? 0;
  if (purged > 0)
    log.info(`[Registry] ${purged} abgelaufene Läufe entfernt (> ${retentionDays} d)`);
  return purged;
}
