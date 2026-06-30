/**
 * ts-rest contract router for /api/board-activity
 *
 * Per-card activity timeline. Most events are recorded by the client after a Yjs
 * mutation (recordActivity); comment/attachment events are recorded server-side.
 * Mount via mountBoardActivityContractRouter(app) after requireAuth in routes.ts.
 */

import {
  assigneesChangedPayloadSchema,
  boardActivityContract,
  type ActivityType,
  type AssigneesChangedPayload,
  type BoardActivityEntry,
} from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import { enqueueAgentTask } from '../../services/boards/agentTaskService.js';
import { buildCardEmailMetadata } from '../../services/boards/BoardService.js';
import { getBoardSubscribers } from '../../services/boards/boardSubscriptionService.js';
import { recordCardActivity } from '../../services/boards/cardActivityService.js';
import { autoSubscribe } from '../../services/boards/cardSubscriptionService.js';
import { GRUENERATOR_BOT_USER_ID } from '../../services/boards/grueneratorBot.js';
import { createNotification } from '../../services/notifications/NotificationService.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';

import { checkBoardAccess } from './boardAccess.js';

import type { Application } from 'express';

const log = createLogger('boardActivityContract');
const db = getPostgresInstance();

const BOARD_EVENT_LABEL: Partial<Record<ActivityType, string>> = {
  board_renamed: 'umbenannt',
  board_archived: 'archiviert',
  board_restored: 'wiederhergestellt',
  board_duplicated: 'dupliziert',
};

function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface AssignmentNotificationParams {
  boardId: string;
  cardId: string;
  actorId: string;
  addedAssigneeIds: string[];
  cardTitle: string | null;
}

/**
 * Notify users who were just assigned to a card (board_card_assigned, tier 1) and
 * auto-subscribe them so they keep getting comment/attachment updates. Mirrors the
 * comment-notification pattern in boardCommentsContractRouter.ts.
 */
async function fireAssignmentNotifications(params: AssignmentNotificationParams): Promise<void> {
  const { boardId, cardId, actorId, addedAssigneeIds, cardTitle } = params;

  // Skip self-assignment and the bot; dedupe.
  const recipients = [...new Set(addedAssigneeIds)].filter(
    (id) => id && id !== actorId && id !== GRUENERATOR_BOT_USER_ID
  );
  if (recipients.length === 0) return;

  const [actorRows, boardRows, knownRows] = await Promise.all([
    db.query<{ display_name: string }>(`SELECT display_name FROM profiles WHERE id = $1`, [
      actorId,
    ]),
    db.query<{ title: string | null }>(`SELECT title FROM collaborative_documents WHERE id = $1`, [
      boardId,
    ]),
    // Guard against bogus IDs: only notify users that actually exist.
    db.query<{ id: string }>(`SELECT id FROM profiles WHERE id = ANY($1::uuid[])`, [recipients]),
  ]);

  const actorName = actorRows[0]?.display_name ?? 'Jemand';
  const boardTitle = boardRows[0]?.title ?? 'ein Board';
  const body = cardTitle?.trim() || boardTitle;
  const actionUrl = `/boards/${boardId}?card=${cardId}`;
  const knownIds = new Set(knownRows.map((r) => r.id));

  // Read the card snapshot once per event for the rich email (cells live in Yjs).
  const cardMeta = await buildCardEmailMetadata(boardId, cardId, boardTitle);

  await Promise.allSettled(
    recipients
      .filter((id) => knownIds.has(id))
      .map(async (assigneeId) => {
        await autoSubscribe(boardId, cardId, assigneeId, 'assignment');
        await createNotification({
          userId: assigneeId,
          type: 'board_card_assigned',
          title: `${actorName} hat dir eine Aufgabe zugewiesen`,
          body,
          actionUrl,
          metadata: cardMeta,
          groupKey: `board-assign-${boardId}-${cardId}`,
        });
      })
  );
}

/**
 * Delegate a card to an agent (or the generic bot) when it's assigned. Unlike the
 * comment @-mention (which carries an explicit user instruction), an assignment has
 * no written ask — so we build a board-anchored instruction from the card's title +
 * description and tell the agent to stay strictly on the card's topic. Without this
 * anchor a strong agent persona drifts and produces something unrelated to the board.
 * The worker additionally injects the full card context (column, comments, documents).
 * Uses the same durable queue + legacy worker path as the comment @-mention.
 */
function buildAssignmentTask(cardTitle: string | null, cardDescription: string | null): string {
  const title = cardTitle?.trim();
  const description = cardDescription?.trim();
  const cardBody = [
    title ? `Titel: ${title}` : '',
    description ? `Beschreibung:\n${description}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  return (
    'Du wurdest einer Aufgabe auf einem Board zugewiesen. Bearbeite die in dieser Karte ' +
    'beschriebene Aufgabe. Stütze dich ausschließlich auf den Karteninhalt sowie die Kommentare ' +
    'und verknüpften Dokumente aus dem bereitgestellten Kontext. Bleibe strikt beim Thema der ' +
    'Karte und erfinde keine fremden Themen.' +
    (cardBody
      ? `\n\n${cardBody}`
      : '\n\n(Die Karte hat noch keinen Titel und keine Beschreibung — orientiere dich an den ' +
        'Kommentaren und dem Kontext der Karte.)')
  );
}

async function delegateCardToAgent(params: {
  boardId: string;
  cardId: string;
  requestedBy: string;
  cardTitle: string | null;
  cardDescription: string | null;
  agentId: string | null;
}): Promise<void> {
  const localeRows = await db.query<{ locale: string }>(
    `SELECT locale FROM profiles WHERE id = $1`,
    [params.requestedBy]
  );
  const taskText = buildAssignmentTask(params.cardTitle, params.cardDescription);

  await enqueueAgentTask({
    boardId: params.boardId,
    cardId: params.cardId,
    triggerCommentId: null,
    requestedBy: params.requestedBy,
    taskText,
    locale: localeRows[0]?.locale ?? 'de-DE',
    agentId: params.agentId,
  });
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

  // Board-wide feed (A8): all cards + board-level events, newest first.
  listBoardActivity: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const { boardId } = args.params;

      const { hasAccess } = await checkBoardAccess(boardId, userId);
      if (!hasAccess) return { status: 403 as const, body: { error: 'Kein Zugriff' } };

      const rows = await db.query<BoardActivityEntry>(
        `SELECT
           a.*,
           p.display_name AS author_name,
           p.avatar_robot_id AS author_avatar_robot_id
         FROM board_card_activity a
         LEFT JOIN profiles p ON a.user_id = p.id
         WHERE a.board_id = $1
         ORDER BY a.created_at DESC
         LIMIT 200`,
        [boardId]
      );
      return { status: 200 as const, body: rows };
    } catch (error) {
      log.error('Error listing board activity', { error: errMsg(error) });
      return { status: 500 as const, body: { error: 'Aktivität konnte nicht geladen werden' } };
    }
  },

  // Record a board-level event (sentinel card_id) and notify board watchers (A9).
  recordBoardActivity: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const { boardId } = args.params;
      const { type, payload } = args.body;

      const { hasAccess, canEdit, boardTitle } = await checkBoardAccess(boardId, userId);
      if (!hasAccess || !canEdit)
        return { status: 403 as const, body: { error: 'Kein Schreibzugriff' } };

      const insertedId = await recordCardActivity({
        boardId,
        cardId: null,
        userId,
        type,
        ...(payload ? { payload } : {}),
      });
      if (!insertedId)
        return { status: 500 as const, body: { error: 'Aktivität nicht gespeichert' } };

      void (async () => {
        try {
          const [subscribers, actorRows] = await Promise.all([
            getBoardSubscribers(boardId),
            db.query<{ display_name: string }>(`SELECT display_name FROM profiles WHERE id = $1`, [
              userId,
            ]),
          ]);
          const actorName = actorRows[0]?.display_name ?? 'Jemand';
          const label = BOARD_EVENT_LABEL[type] ?? 'aktualisiert';
          // allSettled so one failed delivery doesn't skip the remaining watchers.
          await Promise.allSettled(
            subscribers
              .filter((subscriberId) => subscriberId !== userId)
              .map((subscriberId) =>
                createNotification({
                  userId: subscriberId,
                  type: 'board_updates',
                  title: `${actorName} hat „${boardTitle ?? 'ein Board'}“ ${label}`,
                  body: '',
                  actionUrl: `/boards/${boardId}`,
                  metadata: { boardId, activityType: type },
                  groupKey: `board-activity-${boardId}`,
                })
              )
          );
        } catch (err) {
          log.warn('Board watcher fan-out failed', { error: errMsg(err) });
        }
      })();

      const rows = await db.query<BoardActivityEntry>(
        `SELECT
           a.*,
           p.display_name AS author_name,
           p.avatar_robot_id AS author_avatar_robot_id
         FROM board_card_activity a
         LEFT JOIN profiles p ON a.user_id = p.id
         WHERE a.id = $1`,
        [insertedId]
      );
      const entry = rows[0];
      if (!entry) return { status: 500 as const, body: { error: 'Aktivität nicht gespeichert' } };
      return { status: 201 as const, body: entry };
    } catch (error) {
      log.error('Error recording board activity', { error: errMsg(error) });
      return { status: 500 as const, body: { error: 'Aktivität konnte nicht gespeichert werden' } };
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

      // Notify newly-added assignees, and delegate the card to the bot / a specific
      // agent when one was just assigned.
      if (type === 'assignees_changed' && cardId) {
        const parsed = assigneesChangedPayloadSchema.safeParse(payload ?? {});
        const assignPayload: AssigneesChangedPayload = parsed.success ? parsed.data : {};
        const addedAssigneeIds = assignPayload.addedAssigneeIds ?? [];

        if (addedAssigneeIds.length > 0) {
          void fireAssignmentNotifications({
            boardId,
            cardId,
            actorId: userId,
            addedAssigneeIds,
            cardTitle: assignPayload.cardTitle ?? null,
          }).catch((err) =>
            log.warn('Failed to send assignment notifications', { error: errMsg(err) })
          );
        }

        // Assigning the bot (generic) or a specific agent makes it do the task
        // described by the card. The legacy worker path gathers full card context,
        // posts a "working…" comment and replies. Agent slugs never enter
        // addedAssigneeIds (which is cast to ::uuid[]) — they ride in delegateAgentId.
        const delegateAgentId = assignPayload.delegateAgentId ?? null;
        if (delegateAgentId || addedAssigneeIds.includes(GRUENERATOR_BOT_USER_ID)) {
          void delegateCardToAgent({
            boardId,
            cardId,
            requestedBy: userId,
            cardTitle: assignPayload.cardTitle ?? null,
            cardDescription: assignPayload.cardDescription ?? null,
            agentId: delegateAgentId,
          }).catch((err) =>
            log.warn('Failed to enqueue assignment delegation', { error: errMsg(err) })
          );
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
