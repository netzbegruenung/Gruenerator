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
  cardId: string;
  userId: string;
  type: ActivityType;
  payload?: Record<string, unknown>;
}

export async function recordCardActivity(params: RecordCardActivityParams): Promise<void> {
  const { boardId, cardId, userId, type, payload = {} } = params;
  try {
    await db.query(
      `INSERT INTO board_card_activity (board_id, card_id, user_id, type, payload)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [boardId, cardId, userId, type, JSON.stringify(payload)]
    );
  } catch (error) {
    // Fire-and-forget: never let activity recording break the mutation it logs.
    log.warn('Failed to record card activity', {
      type,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
