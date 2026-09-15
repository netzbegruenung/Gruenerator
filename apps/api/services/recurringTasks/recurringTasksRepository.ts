/**
 * EXPERIMENTAL — CRUD + due-claim for standalone recurring agent tasks
 * (recurring_tasks). Not board-scoped: a task references an agent by identifier
 * and delivers its result to the user directly (see recurringTaskRunner).
 *
 * Owner-scoped like userAgentsRepository; the recurrence↔RRULE + next-run math is
 * reused from boards/scheduleRecurrence.ts, and the cluster-safe due-claim mirrors
 * boardScheduleService.claimAndEnqueueDueSchedules (FOR UPDATE SKIP LOCKED).
 */
import {
  type CreateRecurringTaskBody,
  type RecurringTask as ApiRecurringTask,
  type RecurringTaskRun as ApiRecurringTaskRun,
  type ScheduleRecurrence,
  type UpdateRecurringTaskBody,
} from '@gruenerator/contracts';

import {
  type RecurringTask,
  type RecurringTaskRun,
  type RecurringTaskRunStatus,
} from '../../database/schema/recurringTasks.js';
import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import {
  computeNextRun,
  recurrenceToRRuleString,
  rruleStringToRecurrence,
  withRecurrenceDefaults,
} from '../boards/scheduleRecurrence.js';

const db = getPostgresInstance();

/** Map a DB row to the typed API shape (recurrence parsed back from the RRULE). */
export function toApiTask(row: RecurringTask): ApiRecurringTask {
  return {
    id: row.id,
    title: row.title,
    instruction: row.instruction,
    agentIdentifier: row.agent_identifier,
    delivery: row.delivery,
    emailNotify: row.email_notify,
    recurrence: rruleStringToRecurrence(row.rrule),
    timezone: row.timezone,
    enabled: row.enabled,
    locale: row.locale,
    nextRunAt: row.next_run_at.toISOString(),
    lastRunAt: row.last_run_at ? row.last_run_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
  };
}

/** Exported for tests: pure row → wire mapping, no database needed. */
export function toApiRun(row: RecurringTaskRun): ApiRecurringTaskRun {
  return {
    id: row.id,
    taskId: row.task_id,
    status: row.status,
    resultsSummary: row.results_summary,
    resultUrl: row.result_url,
    error: row.error,
    durationMs: row.duration_ms,
    // Written since #3221, so every row older than that carries null.
    verdict: row.verdict ?? null,
    startedAt: row.started_at ? row.started_at.toISOString() : null,
    finishedAt: row.finished_at ? row.finished_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
  };
}

/** Resolve the stored RRULE + first fire instant from a structured recurrence. */
function resolveSchedule(
  recurrence: ScheduleRecurrence,
  timezone: string
): { rrule: string; nextRunAt: Date } {
  const now = new Date();
  const withDefaults = withRecurrenceDefaults(recurrence, timezone, now);
  return {
    rrule: recurrenceToRRuleString(withDefaults),
    nextRunAt: computeNextRun(withDefaults, timezone, now),
  };
}

export async function listRecurringTasks(userId: string): Promise<ApiRecurringTask[]> {
  const rows = await db.query<RecurringTask>(
    `SELECT * FROM recurring_tasks WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  return rows.map(toApiTask);
}

export async function getRecurringTask(
  userId: string,
  id: string
): Promise<ApiRecurringTask | undefined> {
  const rows = await db.query<RecurringTask>(
    `SELECT * FROM recurring_tasks WHERE id = $1 AND user_id = $2 LIMIT 1`,
    [id, userId]
  );
  return rows[0] ? toApiTask(rows[0]) : undefined;
}

/** Owner-scoped raw row fetch (for the runner / run-now, which need the row id). */
export async function getRecurringTaskRow(
  userId: string,
  id: string
): Promise<RecurringTask | undefined> {
  const rows = await db.query<RecurringTask>(
    `SELECT * FROM recurring_tasks WHERE id = $1 AND user_id = $2 LIMIT 1`,
    [id, userId]
  );
  return rows[0];
}

export async function createRecurringTask(
  userId: string,
  body: CreateRecurringTaskBody
): Promise<ApiRecurringTask> {
  const { rrule, nextRunAt } = resolveSchedule(body.recurrence, body.timezone);
  const rows = await db.query<RecurringTask>(
    `INSERT INTO recurring_tasks
       (user_id, agent_identifier, title, instruction, delivery, email_notify, rrule, timezone, enabled, locale, next_run_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      userId,
      body.agentIdentifier ?? null,
      body.title,
      body.instruction,
      body.delivery,
      body.emailNotify,
      rrule,
      body.timezone,
      body.enabled,
      body.locale,
      nextRunAt,
    ]
  );
  return toApiTask(rows[0]);
}

export async function updateRecurringTask(
  userId: string,
  id: string,
  body: UpdateRecurringTaskBody
): Promise<ApiRecurringTask | undefined> {
  const existing = await getRecurringTaskRow(userId, id);
  if (!existing) return undefined;

  // Recompute the RRULE + next fire only when recurrence or timezone changed.
  const timezone = body.timezone ?? existing.timezone;
  let rrule = existing.rrule;
  let nextRunAt = existing.next_run_at;
  if (body.recurrence !== undefined || body.timezone !== undefined) {
    const recurrence = body.recurrence ?? rruleStringToRecurrence(existing.rrule);
    const resolved = resolveSchedule(recurrence, timezone);
    rrule = resolved.rrule;
    nextRunAt = resolved.nextRunAt;
  }

  const rows = await db.query<RecurringTask>(
    `UPDATE recurring_tasks
        SET title = $3,
            instruction = $4,
            agent_identifier = $5,
            delivery = $6,
            timezone = $7,
            locale = $8,
            enabled = $9,
            rrule = $10,
            next_run_at = $11,
            email_notify = $12,
            updated_at = now()
      WHERE id = $1 AND user_id = $2
      RETURNING *`,
    [
      id,
      userId,
      body.title ?? existing.title,
      body.instruction ?? existing.instruction,
      body.agentIdentifier !== undefined ? body.agentIdentifier : existing.agent_identifier,
      body.delivery ?? existing.delivery,
      timezone,
      body.locale ?? existing.locale,
      body.enabled ?? existing.enabled,
      rrule,
      nextRunAt,
      body.emailNotify ?? existing.email_notify,
    ]
  );
  return rows[0] ? toApiTask(rows[0]) : undefined;
}

export async function deleteRecurringTask(userId: string, id: string): Promise<boolean> {
  const rows = await db.query<{ id: string }>(
    `DELETE FROM recurring_tasks WHERE id = $1 AND user_id = $2 RETURNING id`,
    [id, userId]
  );
  return rows.length > 0;
}

export async function listRecurringTaskRuns(
  userId: string,
  taskId: string,
  limit = 20
): Promise<ApiRecurringTaskRun[]> {
  const rows = await db.query<RecurringTaskRun>(
    `SELECT r.* FROM recurring_task_runs r
       JOIN recurring_tasks t ON t.id = r.task_id
      WHERE r.task_id = $1 AND t.user_id = $2
      ORDER BY r.created_at DESC
      LIMIT $3`,
    [taskId, userId, limit]
  );
  return rows.map(toApiRun);
}

// ── Runner-facing helpers (no owner scope — called by the trusted worker) ──────

/**
 * Claim every task whose next_run_at has passed. Cluster-safe: the claim advances
 * next_run_at inside a `FOR UPDATE SKIP LOCKED` transaction so two nodes never fire
 * the same task. Returns the claimed rows for the runner to execute after commit.
 */
export async function claimDueRecurringTasks(
  limit = 5
): Promise<Array<{ task: RecurringTask; runId: string }>> {
  return db.transaction(async (client) => {
    const due = (await db.transactionQuery(
      client,
      `SELECT * FROM recurring_tasks
        WHERE enabled = TRUE AND next_run_at <= now()
        ORDER BY next_run_at
        FOR UPDATE SKIP LOCKED
        LIMIT $1`,
      [limit]
    )) as unknown as RecurringTask[];

    const claimed: Array<{ task: RecurringTask; runId: string }> = [];
    for (const row of due) {
      // ERST den Lauf-Slot holen, dann erst den Zeitplan vorrücken. Die Zeile
      // entsteht damit vor dem Lauf: stirbt der Prozess mittendrin, ist der Lauf
      // trotzdem sichtbar und der Wächter kann ihn abräumen.
      //
      // Läuft für die Aufgabe schon einer (Handlauf), greift der partielle
      // Unique-Index und wir lassen `next_run_at` STEHEN — der nächste Tick
      // versucht es erneut. Würde hier vorgerückt, wäre diese Ausführung still
      // verloren, obwohl sie nie stattgefunden hat.
      const inserted = (await db.transactionQuery(
        client,
        `INSERT INTO recurring_task_runs (task_id, status, started_at)
         VALUES ($1, 'running', now())
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [row.id]
      )) as unknown as Array<{ id: string }>;
      const runId = inserted[0]?.id;
      if (!runId) continue;

      const recurrence = rruleStringToRecurrence(row.rrule);
      const nextRunAt = computeNextRun(recurrence, row.timezone, new Date());
      await db.transactionQuery(
        client,
        `UPDATE recurring_tasks
            SET next_run_at = $2, last_run_at = now(), updated_at = now()
          WHERE id = $1`,
        [row.id, nextRunAt]
      );
      claimed.push({ task: row, runId });
    }
    return claimed;
  });
}

/** Startet einen Lauf von Hand. `null` ⇒ für diese Aufgabe läuft schon einer. */
export async function startManualRecurringRun(taskId: string): Promise<string | null> {
  const rows = await db.query<{ id: string }>(
    `INSERT INTO recurring_task_runs (task_id, status, started_at)
     VALUES ($1, 'running', now())
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [taskId]
  );
  return rows[0]?.id ?? null;
}

/**
 * Räumt Läufe ab, deren Frist abgelaufen ist — der einzige Weg, auf dem ein
 * abgestürzter Lauf je einen Endstatus bekommt. Die Frist deckt zwei volle
 * Loop-Läufe (Erstversuch + Reparatur) samt Prüfung und Zustellung.
 */
export async function sweepStaleRecurringRuns(staleMinutes = 20): Promise<number> {
  const rows = await db.query<{ id: string }>(
    `UPDATE recurring_task_runs
        SET status = 'failed',
            error = 'Lauf abgebrochen: der Dienst wurde neu gestartet, während er lief.',
            finished_at = now()
      WHERE status = 'running'
        AND started_at < now() - make_interval(mins => $1)
      RETURNING id`,
    [staleMinutes]
  );
  return rows.length;
}

/** Fetch a task row by id without owner scoping (trusted worker path). */
export async function getRecurringTaskById(id: string): Promise<RecurringTask | undefined> {
  const rows = await db.query<RecurringTask>(
    `SELECT * FROM recurring_tasks WHERE id = $1 LIMIT 1`,
    [id]
  );
  return rows[0];
}

/**
 * Schliesst den beim Claim angelegten Lauf ab. Kein INSERT mehr: die Zeile
 * existiert bereits als 'running', sonst wäre der Absturz unsichtbar.
 */
export async function finishRecurringTaskRun(params: {
  runId: string;
  status: Exclude<RecurringTaskRunStatus, 'running'>;
  resultsSummary?: string | null;
  resultUrl?: string | null;
  error?: string | null;
  durationMs?: number | null;
  /** Verdikt der Ergebnis-Prüfung (#3221) — Messwert, kein Gate. */
  verdict?: { ok: boolean; hint?: string; repaired?: boolean } | null;
}): Promise<void> {
  await db.query(
    `UPDATE recurring_task_runs
        SET status = $2, results_summary = $3, result_url = $4, error = $5,
            duration_ms = $6, verdict = $7, finished_at = now()
      WHERE id = $1`,
    [
      params.runId,
      params.status,
      params.resultsSummary ?? null,
      params.resultUrl ?? null,
      params.error ?? null,
      params.durationMs ?? null,
      params.verdict != null ? JSON.stringify(params.verdict) : null,
    ]
  );
}

/** Bump / reset the empty-suppression counter after a run. */
export async function setConsecutiveEmptyCount(taskId: string, value: number): Promise<void> {
  await db.query(`UPDATE recurring_tasks SET consecutive_empty_count = $2 WHERE id = $1`, [
    taskId,
    value,
  ]);
}
