/**
 * In-process helper to append a card activity event. Used by the activity
 * contract router (client-recorded Yjs mutations) AND directly by the comments /
 * attachments routers for server-originated events (comment_added, attachment_added).
 */
import { type ActivityType } from '@gruenerator/contracts';

import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('cardActivityService');
const db = getPostgresInstance();

export interface RecordCardActivityParams {
  boardId: string;
  // null for board-level events (A8).
  cardId: string | null;
  userId: string;
  type: ActivityType;
  payload?: Record<string, unknown>;
}

/** Returns the inserted row id, or null if recording failed (never throws). */
export async function recordCardActivity(params: RecordCardActivityParams): Promise<string | null> {
  const { boardId, cardId, userId, type, payload = {} } = params;
  try {
    const rows = await db.query<{ id: string }>(
      `INSERT INTO board_card_activity (board_id, card_id, user_id, type, payload)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       RETURNING id`,
      [boardId, cardId, userId, type, JSON.stringify(payload)]
    );
    return rows[0]?.id ?? null;
  } catch (error) {
    log.warn('Failed to record card activity', {
      type,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
