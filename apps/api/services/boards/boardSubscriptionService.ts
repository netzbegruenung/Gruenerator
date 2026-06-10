/**
 * Whole-board watchers (A9). Backed by the board_subscriptions table — replaces
 * the earlier '__board__' sentinel card_id in board_card_subscriptions.
 */
import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';

const db = getPostgresInstance();

export async function getBoardSubscribers(boardId: string): Promise<string[]> {
  const rows = await db.query<{ user_id: string }>(
    `SELECT user_id FROM board_subscriptions WHERE board_id = $1`,
    [boardId]
  );
  return rows.map((r) => r.user_id);
}

export async function subscribeToBoard(boardId: string, userId: string): Promise<void> {
  await db.query(
    `INSERT INTO board_subscriptions (board_id, user_id)
     VALUES ($1, $2)
     ON CONFLICT (board_id, user_id) DO NOTHING`,
    [boardId, userId]
  );
}

export async function unsubscribeFromBoard(boardId: string, userId: string): Promise<void> {
  await db.query(`DELETE FROM board_subscriptions WHERE board_id = $1 AND user_id = $2`, [
    boardId,
    userId,
  ]);
}

export async function countBoardSubscribers(boardId: string): Promise<number> {
  const rows = await db.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM board_subscriptions WHERE board_id = $1`,
    [boardId]
  );
  return rows[0]?.count ?? 0;
}

export async function isBoardSubscribed(boardId: string, userId: string): Promise<boolean> {
  const rows = await db.query<{ exists: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM board_subscriptions WHERE board_id = $1 AND user_id = $2
     ) AS exists`,
    [boardId, userId]
  );
  return rows[0]?.exists ?? false;
}
