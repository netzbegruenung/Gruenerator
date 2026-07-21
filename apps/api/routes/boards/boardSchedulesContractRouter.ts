/**
 * ts-rest contract router for scheduled / recurring KI-Spalte runs.
 *
 * CRUD over board_scheduled_runs plus "run now" and run-history listing. Mutations
 * require board edit access; the heavy work always runs in boardAgentWorker →
 * runFlow — this router only manages schedules and reads run status. Mount via
 * mountBoardSchedulesContractRouter(app) under the authed /api/board-schedules prefix.
 */
import { boardSchedulesContract, type BoardAgentRunRecord } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import { acceptReviewTask } from '../../services/boards/agentTaskService.js';
import {
  createSchedule,
  deleteSchedule,
  enqueueScheduleRun,
  listSchedules,
  redoRun,
  updateSchedule,
} from '../../services/boards/boardScheduleService.js';
import { isConfigured as isApifyConfigured } from '../../services/monitor/ApifyService.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';

import { checkBoardAccess } from './boardAccess.js';

import type { AgentTaskStatus } from '../../database/schema/agentTasks.js';
import type { Application } from 'express';

const log = createLogger('boardSchedulesContract');
const db = getPostgresInstance();

const s = initServer();

interface RunRow {
  id: string;
  board_id: string;
  card_id: string;
  schedule_id: string | null;
  status: AgentTaskStatus;
  result_document_id: string | null;
  error: string | null;
  created_at: Date;
  completed_at: Date | null;
}

function toRunRecord(row: RunRow): BoardAgentRunRecord {
  return {
    id: row.id,
    boardId: row.board_id,
    cardId: row.card_id,
    scheduleId: row.schedule_id,
    status: row.status,
    resultDocumentId: row.result_document_id,
    error: row.error,
    createdAt: row.created_at.toISOString(),
    completedAt: row.completed_at ? row.completed_at.toISOString() : null,
  };
}

export const boardSchedulesContractRouter = s.router(boardSchedulesContract, {
  listSchedules: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const { boardId } = args.params;
      const { hasAccess } = await checkBoardAccess(boardId, userId);
      if (!hasAccess) return { status: 403 as const, body: { error: 'Kein Zugriff' } };
      return { status: 200 as const, body: await listSchedules(boardId) };
    } catch (error) {
      log.error('listSchedules failed', { error: errMsg(error) });
      return { status: 500 as const, body: { error: 'Zeitpläne konnten nicht geladen werden' } };
    }
  },

  createSchedule: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const { boardId, cardId } = args.params;
      const { canEdit } = await checkBoardAccess(boardId, userId);
      if (!canEdit) return { status: 403 as const, body: { error: 'Kein Schreibzugriff' } };

      if (args.body.flow.source.type === 'apify_social' && !isApifyConfigured()) {
        return {
          status: 400 as const,
          body: { error: 'Social-Media-Recherche ist nicht konfiguriert (APIFY_TOKEN fehlt).' },
        };
      }

      const localeRows = await db.query<{ locale: string }>(
        `SELECT locale FROM profiles WHERE id = $1`,
        [userId]
      );
      const schedule = await createSchedule(
        boardId,
        cardId,
        userId,
        localeRows[0]?.locale ?? 'de-DE',
        args.body
      );
      return { status: 201 as const, body: schedule };
    } catch (error) {
      log.error('createSchedule failed', { error: errMsg(error) });
      return { status: 500 as const, body: { error: 'Zeitplan konnte nicht erstellt werden' } };
    }
  },

  updateSchedule: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const { boardId, scheduleId } = args.params;
      const { canEdit } = await checkBoardAccess(boardId, userId);
      if (!canEdit) return { status: 403 as const, body: { error: 'Kein Schreibzugriff' } };

      const updated = await updateSchedule(boardId, scheduleId, args.body);
      if (!updated) return { status: 404 as const, body: { error: 'Zeitplan nicht gefunden' } };
      return { status: 200 as const, body: updated };
    } catch (error) {
      log.error('updateSchedule failed', { error: errMsg(error) });
      return { status: 500 as const, body: { error: 'Zeitplan konnte nicht geändert werden' } };
    }
  },

  deleteSchedule: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const { boardId, scheduleId } = args.params;
      const { canEdit } = await checkBoardAccess(boardId, userId);
      if (!canEdit) return { status: 403 as const, body: { error: 'Kein Schreibzugriff' } };

      const deleted = await deleteSchedule(boardId, scheduleId);
      if (!deleted) return { status: 404 as const, body: { error: 'Zeitplan nicht gefunden' } };
      return { status: 200 as const, body: { success: true as const } };
    } catch (error) {
      log.error('deleteSchedule failed', { error: errMsg(error) });
      return { status: 500 as const, body: { error: 'Zeitplan konnte nicht gelöscht werden' } };
    }
  },

  runScheduleNow: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const { boardId, scheduleId } = args.params;
      const { canEdit } = await checkBoardAccess(boardId, userId);
      if (!canEdit) return { status: 403 as const, body: { error: 'Kein Schreibzugriff' } };

      const taskId = await enqueueScheduleRun(boardId, scheduleId);
      if (!taskId) return { status: 404 as const, body: { error: 'Zeitplan nicht gefunden' } };
      return { status: 202 as const, body: { taskId } };
    } catch (error) {
      log.error('runScheduleNow failed', { error: errMsg(error) });
      return { status: 500 as const, body: { error: 'Lauf konnte nicht gestartet werden' } };
    }
  },

  acceptRun: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const { boardId, taskId } = args.params;
      const { canEdit } = await checkBoardAccess(boardId, userId);
      if (!canEdit) return { status: 403 as const, body: { error: 'Kein Schreibzugriff' } };

      const ok = await acceptReviewTask(taskId);
      if (!ok) return { status: 404 as const, body: { error: 'Lauf nicht gefunden' } };
      return { status: 200 as const, body: { success: true as const } };
    } catch (error) {
      log.error('acceptRun failed', { error: errMsg(error) });
      return { status: 500 as const, body: { error: 'Lauf konnte nicht bestätigt werden' } };
    }
  },

  redoRun: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const { boardId, taskId } = args.params;
      const { canEdit } = await checkBoardAccess(boardId, userId);
      if (!canEdit) return { status: 403 as const, body: { error: 'Kein Schreibzugriff' } };

      const newTaskId = await redoRun(boardId, taskId, args.body.instruction);
      if (!newTaskId) return { status: 404 as const, body: { error: 'Lauf nicht gefunden' } };
      return { status: 202 as const, body: { taskId: newTaskId } };
    } catch (error) {
      log.error('redoRun failed', { error: errMsg(error) });
      return { status: 500 as const, body: { error: 'Lauf konnte nicht wiederholt werden' } };
    }
  },

  listRuns: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const { boardId } = args.params;
      const { hasAccess } = await checkBoardAccess(boardId, userId);
      if (!hasAccess) return { status: 403 as const, body: { error: 'Kein Zugriff' } };

      const { cardId, scheduleId } = args.query;
      const conditions = ['board_id = $1'];
      const params: unknown[] = [boardId];
      if (cardId) {
        params.push(cardId);
        conditions.push(`card_id = $${params.length}`);
      }
      if (scheduleId) {
        params.push(scheduleId);
        conditions.push(`schedule_id = $${params.length}`);
      }

      const rows = await db.query<RunRow>(
        `SELECT id, board_id, card_id, schedule_id, status, result_document_id, error, created_at, completed_at
           FROM agent_tasks
          WHERE ${conditions.join(' AND ')}
          ORDER BY created_at DESC
          LIMIT 100`,
        params
      );
      return { status: 200 as const, body: rows.map(toRunRecord) };
    } catch (error) {
      log.error('listRuns failed', { error: errMsg(error) });
      return { status: 500 as const, body: { error: 'Läufe konnten nicht geladen werden' } };
    }
  },
});

export function mountBoardSchedulesContractRouter(app: Application): void {
  createExpressEndpoints(boardSchedulesContract, boardSchedulesContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'boardSchedulesContract'),
  });
}

function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
