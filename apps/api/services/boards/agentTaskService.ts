/**
 * Durable task queue for the asynchronous Grünerator board agent.
 *
 * Tasks are enqueued from the comment-mention path (boardCommentsContractRouter)
 * and drained by boardAgentWorker. Claiming uses `FOR UPDATE SKIP LOCKED` so the
 * poller is safe to run in every cluster worker without double-processing.
 */
import { type CommentBlock } from '@gruenerator/contracts';

import { type AgentTask } from '../../database/schema/agentTasks.js';
import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import { createLogger } from '../../utils/logger.js';

import { GRUENERATOR_BOT_USER_ID } from './grueneratorBot.js';

const db = getPostgresInstance();
const log = createLogger('agentTaskService');

// A task left in 'running' longer than this is assumed to belong to a crashed
// worker and becomes claimable again (the attempt was already counted at claim).
const STALE_RUNNING_MINUTES = 10;

export interface EnqueueAgentTaskParams {
  boardId: string;
  cardId: string;
  triggerCommentId: string | null;
  requestedBy: string;
  taskText: string;
  locale: string;
}

export async function enqueueAgentTask(params: EnqueueAgentTaskParams): Promise<AgentTask> {
  const rows = await db.query<AgentTask>(
    `INSERT INTO agent_tasks (board_id, card_id, trigger_comment_id, requested_by, task_text, locale)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      params.boardId,
      params.cardId,
      params.triggerCommentId,
      params.requestedBy,
      params.taskText,
      params.locale,
    ]
  );
  log.info(`Enqueued agent task ${rows[0].id} for board ${params.boardId} card ${params.cardId}`);
  return rows[0];
}

/**
 * Atomically claim the oldest claimable task (pending, or a stale 'running' task
 * from a crashed worker), marking it 'running' and incrementing its attempt
 * count. Returns null when there is nothing to do.
 */
export async function claimNextAgentTask(): Promise<AgentTask | null> {
  const rows = await db.query<AgentTask>(
    `UPDATE agent_tasks
        SET status = 'running', started_at = now(), updated_at = now(), attempts = attempts + 1
      WHERE id = (
        SELECT id FROM agent_tasks
         WHERE status = 'pending'
            OR (status = 'running' AND started_at < now() - make_interval(mins => $1))
         ORDER BY created_at
         FOR UPDATE SKIP LOCKED
         LIMIT 1
      )
      RETURNING *`,
    [STALE_RUNNING_MINUTES]
  );
  return rows[0] ?? null;
}

export async function completeAgentTask(taskId: string, documentId: string): Promise<void> {
  await db.query(
    `UPDATE agent_tasks
        SET status = 'completed', result_document_id = $2, error = NULL,
            completed_at = now(), updated_at = now()
      WHERE id = $1`,
    [taskId, documentId]
  );
}

/**
 * Record a failed attempt. Resets to 'pending' for another try while attempts
 * remain, otherwise marks the task permanently 'failed'.
 */
export async function failOrRetryAgentTask(
  task: AgentTask,
  errorMessage: string
): Promise<{ willRetry: boolean }> {
  if (task.attempts < task.max_attempts) {
    await db.query(
      `UPDATE agent_tasks SET status = 'pending', error = $2, updated_at = now() WHERE id = $1`,
      [task.id, errorMessage]
    );
    return { willRetry: true };
  }
  await db.query(
    `UPDATE agent_tasks
        SET status = 'failed', error = $2, completed_at = now(), updated_at = now()
      WHERE id = $1`,
    [task.id, errorMessage]
  );
  return { willRetry: false };
}

export interface PostBotCommentParams {
  boardId: string;
  cardId: string;
  /** Reply under this comment when it is top-level; otherwise post a new top-level comment. */
  parentId: string | null;
  blocks: CommentBlock[];
}

/** Author a comment on a card as the Grünerator bot (used for ack/result replies). */
export async function postBotComment(params: PostBotCommentParams): Promise<void> {
  const content = params.blocks
    .map((b) => (b.type === 'mention' ? `@${b.displayName ?? ''}` : (b.text ?? '')))
    .join('')
    .trim();

  // Only one reply level is allowed (see boardCommentsContractRouter.createComment).
  // If the trigger comment is itself a reply, fall back to a top-level comment.
  let parentId = params.parentId;
  if (parentId) {
    const parent = await db.query<{ parent_id: string | null }>(
      `SELECT parent_id FROM board_comments WHERE id = $1`,
      [parentId]
    );
    if (parent.length === 0 || parent[0].parent_id) parentId = null;
  }

  await db.query(
    `INSERT INTO board_comments (board_id, card_id, parent_id, user_id, content, blocks, mentioned_user_ids)
     VALUES ($1, $2, $3, $4, $5, $6, '{}')`,
    [
      params.boardId,
      params.cardId,
      parentId,
      GRUENERATOR_BOT_USER_ID,
      content,
      JSON.stringify(params.blocks),
    ]
  );
}
