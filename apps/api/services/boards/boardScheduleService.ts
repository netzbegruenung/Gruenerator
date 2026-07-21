/**
 * CRUD + due-claim for scheduled / recurring KI-Spalte runs (board_scheduled_runs).
 *
 * A schedule is an upstream trigger on the existing agent pipeline: firing one just
 * calls enqueueAgentTask with the stored flow config, so the run drains through the
 * unchanged boardAgentWorker → runFlow path. The recurrence↔RRULE math lives in
 * scheduleRecurrence.ts; this service owns persistence and the cluster-safe claim.
 */
import {
  type BoardFlowConfig,
  type BoardSchedule,
  type BoardScheduleInput,
  type BoardScheduleUpdate,
} from '@gruenerator/contracts';

import { type AgentTask } from '../../database/schema/agentTasks.js';
import { type BoardScheduledRun } from '../../database/schema/boardScheduledRuns.js';
import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import { createLogger } from '../../utils/logger.js';

import { enqueueAgentTask, flowTaskText } from './agentTaskService.js';
import {
  computeNextRun,
  recurrenceToRRuleString,
  rruleStringToRecurrence,
  withRecurrenceDefaults,
} from './scheduleRecurrence.js';

const db = getPostgresInstance();
const log = createLogger('boardScheduleService');

/** Map a DB row to the typed API shape (recurrence parsed back from the RRULE). */
export function toApiSchedule(row: BoardScheduledRun): BoardSchedule {
  return {
    id: row.id,
    boardId: row.board_id,
    cardId: row.card_id,
    recurrence: rruleStringToRecurrence(row.rrule),
    timezone: row.timezone,
    requireReview: row.require_review,
    enabled: row.enabled,
    nextRunAt: row.next_run_at.toISOString(),
    lastRunAt: row.last_run_at ? row.last_run_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
  };
}

export async function listSchedules(boardId: string): Promise<BoardSchedule[]> {
  const rows = await db.query<BoardScheduledRun>(
    `SELECT * FROM board_scheduled_runs WHERE board_id = $1 ORDER BY created_at DESC`,
    [boardId]
  );
  return rows.map(toApiSchedule);
}

export async function createSchedule(
  boardId: string,
  cardId: string,
  createdBy: string,
  locale: string,
  input: BoardScheduleInput
): Promise<BoardSchedule> {
  const now = new Date();
  const recurrence = withRecurrenceDefaults(input.recurrence, input.timezone, now);
  const rrule = recurrenceToRRuleString(recurrence);
  const nextRunAt = computeNextRun(recurrence, input.timezone, now);
  const flowConfig: BoardFlowConfig = { ...input.flow, cardContext: input.cardContext };

  const rows = await db.query<BoardScheduledRun>(
    `INSERT INTO board_scheduled_runs
       (board_id, card_id, created_by, locale, flow_config, rrule, timezone, require_review, enabled, next_run_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      boardId,
      cardId,
      createdBy,
      locale,
      JSON.stringify(flowConfig),
      rrule,
      input.timezone,
      input.requireReview,
      input.enabled,
      nextRunAt,
    ]
  );
  log.info(`Created schedule ${rows[0].id} for board ${boardId} card ${cardId} (${rrule})`);
  return toApiSchedule(rows[0]);
}

export async function updateSchedule(
  boardId: string,
  scheduleId: string,
  patch: BoardScheduleUpdate
): Promise<BoardSchedule | null> {
  const existing = await db.query<BoardScheduledRun>(
    `SELECT * FROM board_scheduled_runs WHERE id = $1 AND board_id = $2`,
    [scheduleId, boardId]
  );
  if (existing.length === 0) return null;
  const row = existing[0];

  const timezone = patch.timezone ?? row.timezone;
  // If recurrence or timezone changed, rebuild the RRULE and recompute next_run_at
  // so the edit takes effect on the next fire (mirrors OpenWebUI/LobeHub behaviour).
  let rrule = row.rrule;
  let nextRunAt = row.next_run_at;
  if (patch.recurrence || patch.timezone) {
    const base = patch.recurrence ?? rruleStringToRecurrence(row.rrule);
    const recurrence = withRecurrenceDefaults(base, timezone, new Date());
    rrule = recurrenceToRRuleString(recurrence);
    nextRunAt = computeNextRun(recurrence, timezone, new Date());
  }

  const flowConfig: BoardFlowConfig | null =
    patch.flow && patch.cardContext ? { ...patch.flow, cardContext: patch.cardContext } : null;

  const rows = await db.query<BoardScheduledRun>(
    `UPDATE board_scheduled_runs
        SET rrule = $3,
            timezone = $4,
            require_review = COALESCE($5, require_review),
            enabled = COALESCE($6, enabled),
            next_run_at = $7,
            flow_config = COALESCE($8, flow_config),
            updated_at = now()
      WHERE id = $1 AND board_id = $2
      RETURNING *`,
    [
      scheduleId,
      boardId,
      rrule,
      timezone,
      patch.requireReview ?? null,
      patch.enabled ?? null,
      nextRunAt,
      flowConfig ? JSON.stringify(flowConfig) : null,
    ]
  );
  return rows[0] ? toApiSchedule(rows[0]) : null;
}

export async function deleteSchedule(boardId: string, scheduleId: string): Promise<boolean> {
  const rows = await db.query<{ id: string }>(
    `DELETE FROM board_scheduled_runs WHERE id = $1 AND board_id = $2 RETURNING id`,
    [scheduleId, boardId]
  );
  return rows.length > 0;
}

/**
 * Enqueue a single agent task from a schedule (used by "run now" and the poller).
 * Returns the new task id, or null if the schedule no longer exists.
 */
export async function enqueueScheduleRun(
  boardId: string,
  scheduleId: string
): Promise<string | null> {
  const rows = await db.query<BoardScheduledRun>(
    `SELECT * FROM board_scheduled_runs WHERE id = $1 AND board_id = $2`,
    [scheduleId, boardId]
  );
  if (rows.length === 0) return null;
  return enqueueFromRow(rows[0]);
}

async function enqueueFromRow(row: BoardScheduledRun): Promise<string> {
  const task = await enqueueAgentTask({
    boardId: row.board_id,
    cardId: row.card_id,
    triggerCommentId: null,
    requestedBy: row.created_by,
    taskText: flowTaskText(row.flow_config),
    locale: row.locale,
    flowConfig: row.flow_config,
    scheduleId: row.id,
    requireReview: row.require_review,
  });
  return task.id;
}

/**
 * Redo a run that was awaiting review (Phase 2): re-enqueue the original run's flow
 * as a fresh task. An optional `instruction` is injected into the card context so
 * the AI sees the human's refinement note — reusing the exact enqueue → runFlow path
 * (no separate "refine" executor). Returns the new task id, or null if not found.
 */
export async function redoRun(
  boardId: string,
  taskId: string,
  instruction?: string
): Promise<string | null> {
  const rows = await db.query<AgentTask>(
    `SELECT * FROM agent_tasks WHERE id = $1 AND board_id = $2`,
    [taskId, boardId]
  );
  if (rows.length === 0) return null;
  const orig = rows[0];
  if (!orig.flow_config) return null; // only KI-Spalte flow runs are redoable here

  const note = instruction?.trim();
  const flowConfig = note
    ? {
        ...orig.flow_config,
        cardContext: {
          ...orig.flow_config.cardContext,
          description:
            `${orig.flow_config.cardContext.description}\n\n--- ÜBERARBEITUNG ---\n${note}`.trim(),
        },
      }
    : orig.flow_config;

  const task = await enqueueAgentTask({
    boardId: orig.board_id,
    cardId: orig.card_id,
    triggerCommentId: null,
    requestedBy: orig.requested_by,
    taskText: flowTaskText(flowConfig),
    locale: orig.locale,
    flowConfig,
    scheduleId: orig.schedule_id,
    requireReview: orig.require_review,
  });
  return task.id;
}

/**
 * Claim every schedule whose next_run_at has passed and fire it. Cluster-safe:
 * the claim advances next_run_at inside a `FOR UPDATE SKIP LOCKED` transaction so
 * two nodes never fire the same schedule, and the enqueue happens after commit so
 * the row lock isn't held across the (fast) insert.
 */
export async function claimAndEnqueueDueSchedules(): Promise<number> {
  const claimed = await db.transaction(async (client) => {
    const due = (await db.transactionQuery(
      client,
      `SELECT * FROM board_scheduled_runs
        WHERE enabled = TRUE AND next_run_at <= now()
        ORDER BY next_run_at
        FOR UPDATE SKIP LOCKED
        LIMIT 50`,
      []
    )) as unknown as BoardScheduledRun[];

    for (const row of due) {
      const recurrence = rruleStringToRecurrence(row.rrule);
      const nextRunAt = computeNextRun(recurrence, row.timezone, new Date());
      await db.transactionQuery(
        client,
        `UPDATE board_scheduled_runs
            SET next_run_at = $2, last_run_at = now(), updated_at = now()
          WHERE id = $1`,
        [row.id, nextRunAt]
      );
    }
    return due;
  });

  let fired = 0;
  for (const row of claimed) {
    try {
      await enqueueFromRow(row);
      fired++;
    } catch (err: unknown) {
      log.error(
        `Failed to enqueue run for schedule ${row.id}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
  if (fired > 0) log.info(`Fired ${fired} scheduled run(s)`);
  return fired;
}
