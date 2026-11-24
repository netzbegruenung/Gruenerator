/**
 * Benachrichtigung bei einer neuen Zuweisung (`board_card_assigned`, Stufe 1)
 * samt Abo der Karte. Eine Funktion für beide Wege: das Web meldet die Zuweisung
 * über `recordActivity` (`boardActivityContractRouter.ts`), der Chat nach dem
 * Schreiben der Zelle (`boards_tasks`, `confirmController` für `modify_board`).
 */
import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import { createLogger } from '../../utils/logger.js';
import { createNotification } from '../notifications/NotificationService.js';

import { buildCardEmailMetadata } from './BoardService.js';
import { recordCardActivity } from './cardActivityService.js';
import { autoSubscribe } from './cardSubscriptionService.js';
import { GRUENERATOR_BOT_USER_ID } from './grueneratorBot.js';

const db = getPostgresInstance();
const log = createLogger('cardAssignmentNotifications');

export interface AssignmentNotificationParams {
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
export async function fireAssignmentNotifications(
  params: AssignmentNotificationParams
): Promise<void> {
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
    db.query<{ title: string | null }>(
      `SELECT title FROM collaborative_documents WHERE id = $1 AND is_deleted = false`,
      [boardId]
    ),
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
 * Was eine Zuweisung im Web nach sich zieht, für die Schreibwege des Servers:
 * Verlaufseintrag `assignees_changed` und, für neu Zuständige, Benachrichtigung
 * samt Abo. Wirft nie — die Zelle ist zu diesem Zeitpunkt schon geschrieben.
 */
export async function recordAssignment(params: {
  boardId: string;
  cardId: string;
  userId: string;
  names: string[];
  addedAssigneeIds: string[];
  cardTitle: string | null;
}): Promise<void> {
  const { boardId, cardId, userId, names, addedAssigneeIds, cardTitle } = params;
  await recordCardActivity({
    boardId,
    cardId,
    userId,
    type: 'assignees_changed',
    payload: {
      names,
      ...(addedAssigneeIds.length ? { addedAssigneeIds, cardTitle } : {}),
    },
  });
  if (addedAssigneeIds.length === 0) return;
  void fireAssignmentNotifications({
    boardId,
    cardId,
    actorId: userId,
    addedAssigneeIds,
    cardTitle,
  }).catch((err: unknown) =>
    log.warn('Failed to send assignment notifications', {
      error: err instanceof Error ? err.message : String(err),
    })
  );
}
