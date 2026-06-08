/**
 * Card watcher / subscription helpers, shared by the subscriptions router and the
 * comments / attachments routers (auto-subscribe + notification fan-out).
 */
import { type SubscriptionSource } from '@gruenerator/contracts';

import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('cardSubscriptionService');
const db = getPostgresInstance();

/** User ids currently watching a card. */
export async function getCardSubscribers(boardId: string, cardId: string): Promise<string[]> {
  const rows = await db.query<{ user_id: string }>(
    `SELECT user_id FROM board_card_subscriptions WHERE board_id = $1 AND card_id = $2`,
    [boardId, cardId]
  );
  return rows.map((r) => r.user_id);
}

/** Idempotently subscribe a user (no-op if already watching). */
export async function autoSubscribe(
  boardId: string,
  cardId: string,
  userId: string,
  source: SubscriptionSource
): Promise<void> {
  try {
    await db.query(
      `INSERT INTO board_card_subscriptions (board_id, card_id, user_id, source)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (board_id, card_id, user_id) DO NOTHING`,
      [boardId, cardId, userId, source]
    );
  } catch (error) {
    log.warn('Failed to auto-subscribe', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function subscribeToCard(
  boardId: string,
  cardId: string,
  userId: string
): Promise<void> {
  await autoSubscribe(boardId, cardId, userId, 'manual');
}

export async function unsubscribeFromCard(
  boardId: string,
  cardId: string,
  userId: string
): Promise<void> {
  await db.query(
    `DELETE FROM board_card_subscriptions WHERE board_id = $1 AND card_id = $2 AND user_id = $3`,
    [boardId, cardId, userId]
  );
}

export async function countSubscribers(boardId: string, cardId: string): Promise<number> {
  const rows = await db.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM board_card_subscriptions WHERE board_id = $1 AND card_id = $2`,
    [boardId, cardId]
  );
  return rows[0]?.count ?? 0;
}

export async function isSubscribed(
  boardId: string,
  cardId: string,
  userId: string
): Promise<boolean> {
  const rows = await db.query<{ exists: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM board_card_subscriptions
       WHERE board_id = $1 AND card_id = $2 AND user_id = $3
     ) AS exists`,
    [boardId, cardId, userId]
  );
  return rows[0]?.exists ?? false;
}
