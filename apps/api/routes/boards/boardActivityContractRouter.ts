/**
 * ts-rest contract router for /api/board-activity
 *
 * Per-card activity timeline. Most events are recorded by the client after a Yjs
 * mutation (recordActivity); comment/attachment events are recorded server-side.
 * Mount via mountBoardActivityContractRouter(app) after requireAuth in routes.ts.
 */

import { boardActivityContract, type BoardActivityEntry } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import { recordCardActivity } from '../../services/boards/cardActivityService.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';

import { checkBoardAccess } from './boardAccess.js';

import type { Application } from 'express';

const log = createLogger('boardActivityContract');
const db = getPostgresInstance();

function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const s = initServer();

export const boardActivityContractRouter = s.router(boardActivityContract, {
  listActivity: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const { boardId, cardId } = args.params;

      const { hasAccess } = await checkBoardAccess(boardId, userId);
      if (!hasAccess) return { status: 403 as const, body: { error: 'Kein Zugriff' } };

      const rows = await db.query<BoardActivityEntry>(
        `SELECT
           a.*,
           p.display_name AS author_name,
           p.avatar_robot_id AS author_avatar_robot_id
         FROM board_card_activity a
         LEFT JOIN profiles p ON a.user_id = p.id
         WHERE a.board_id = $1 AND a.card_id = $2
         ORDER BY a.created_at ASC
         LIMIT 200`,
        [boardId, cardId]
      );
      return { status: 200 as const, body: rows };
    } catch (error) {
      log.error('Error listing activity', { error: errMsg(error) });
      return { status: 500 as const, body: { error: 'Aktivität konnte nicht geladen werden' } };
    }
  },

  recordActivity: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const { boardId, cardId } = args.params;
      const { type, payload } = args.body;

      const { hasAccess, canEdit } = await checkBoardAccess(boardId, userId);
      if (!hasAccess || !canEdit)
        return { status: 403 as const, body: { error: 'Kein Schreibzugriff' } };

      await recordCardActivity({
        boardId,
        cardId,
        userId,
        type,
        ...(payload ? { payload } : {}),
      });

      // Keep the relational due-date mirror in sync so the reminder worker can
      // scan it (Yjs due-date cells aren't queryable from Postgres).
      if (type === 'due_changed') {
        const dueDate = typeof payload?.dueDate === 'string' ? payload.dueDate : null;
        if (dueDate) {
          await db.query(
            `INSERT INTO board_card_due_dates (board_id, card_id, due_date, reminded_at, updated_at)
             VALUES ($1, $2, $3, NULL, CURRENT_TIMESTAMP)
             ON CONFLICT (board_id, card_id)
             DO UPDATE SET due_date = EXCLUDED.due_date, reminded_at = NULL, updated_at = CURRENT_TIMESTAMP`,
            [boardId, cardId, dueDate]
          );
        } else {
          await db.query(`DELETE FROM board_card_due_dates WHERE board_id = $1 AND card_id = $2`, [
            boardId,
            cardId,
          ]);
        }
      }

      const rows = await db.query<BoardActivityEntry>(
        `SELECT
           a.*,
           p.display_name AS author_name,
           p.avatar_robot_id AS author_avatar_robot_id
         FROM board_card_activity a
         LEFT JOIN profiles p ON a.user_id = p.id
         WHERE a.board_id = $1 AND a.card_id = $2
         ORDER BY a.created_at DESC
         LIMIT 1`,
        [boardId, cardId]
      );
      const entry = rows[0];
      if (!entry) return { status: 500 as const, body: { error: 'Aktivität nicht gespeichert' } };
      return { status: 201 as const, body: entry };
    } catch (error) {
      log.error('Error recording activity', { error: errMsg(error) });
      return { status: 500 as const, body: { error: 'Aktivität konnte nicht gespeichert werden' } };
    }
  },

  clearActivity: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const { boardId, cardId } = args.params;

      const { hasAccess, createdBy } = await checkBoardAccess(boardId, userId);
      if (!hasAccess) return { status: 403 as const, body: { error: 'Kein Zugriff' } };
      if (createdBy !== userId)
        return { status: 403 as const, body: { error: 'Nur der*die Eigentümer*in' } };

      await db.query(`DELETE FROM board_card_activity WHERE board_id = $1 AND card_id = $2`, [
        boardId,
        cardId,
      ]);
      return { status: 200 as const, body: { success: true as const } };
    } catch (error) {
      log.error('Error clearing activity', { error: errMsg(error) });
      return { status: 500 as const, body: { error: 'Aktivität konnte nicht gelöscht werden' } };
    }
  },
});

export function mountBoardActivityContractRouter(app: Application): void {
  createExpressEndpoints(boardActivityContract, boardActivityContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'boardActivityContract'),
  });
}
