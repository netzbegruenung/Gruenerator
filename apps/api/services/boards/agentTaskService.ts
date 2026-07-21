/**
 * Durable task queue for the asynchronous Grünerator board agent.
 *
 * Tasks are enqueued from the comment-mention path (boardCommentsContractRouter)
 * and drained by boardAgentWorker. Claiming uses `FOR UPDATE SKIP LOCKED` so the
 * poller is safe to run in every cluster worker without double-processing.
 */
import { type BoardAiTask, type BoardFlowConfig, type CommentBlock } from '@gruenerator/contracts';

import { type AgentTask } from '../../database/schema/agentTasks.js';
import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import { createLogger } from '../../utils/logger.js';

import { bumpCardComments } from './boardLiveSignalService.js';
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
  /** Set for AI-column ("KI-Spalte") tasks; null/undefined = legacy @-mention task. */
  flowConfig?: BoardFlowConfig | null;
  /**
   * Identifier of a specific agent (own / group-shared / system) to run this task.
   * Null/undefined → the default universal agent. A TEXT slug, never a UUID.
   */
  agentId?: string | null;
  /** Set when spawned by a board_scheduled_runs schedule; null for manual runs. */
  scheduleId?: string | null;
  /** Park the finished run in 'awaiting_review' instead of completing silently. */
  requireReview?: boolean;
}

/**
 * The one-line task label for a KI-Spalte flow: a custom prompt uses its own text,
 * a preset uses a stable label. Shared by the manual agent-run endpoint and the
 * scheduler so both produce identically-shaped tasks.
 */
export function flowTaskText(flow: BoardAiTask): string {
  return flow.task.type === 'custom' ? flow.task.prompt : `KI-Aufgabe: ${flow.task.preset}`;
}

export async function enqueueAgentTask(params: EnqueueAgentTaskParams): Promise<AgentTask> {
  const rows = await db.query<AgentTask>(
    `INSERT INTO agent_tasks (board_id, card_id, trigger_comment_id, requested_by, task_text, locale, flow_config, agent_id, schedule_id, require_review)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      params.boardId,
      params.cardId,
      params.triggerCommentId,
      params.requestedBy,
      params.taskText,
      params.locale,
      params.flowConfig ? JSON.stringify(params.flowConfig) : null,
      params.agentId ?? null,
      params.scheduleId ?? null,
      params.requireReview ?? false,
    ]
  );
  log.info(`Enqueued agent task ${rows[0].id} for board ${params.boardId} card ${params.cardId}`);

  // No acknowledgement comment here. The @-mention path posts a single "working"
  // comment from the worker and updates it in place to the answer (see
  // boardAgentWorker) — so there's never a redundant ack + answer pair. Flow
  // (Grünerator-Spalte) tasks show running state via the start button + toast.

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

export async function completeAgentTask(taskId: string, documentId: string | null): Promise<void> {
  await db.query(
    `UPDATE agent_tasks
        SET status = 'completed', result_document_id = $2, error = NULL,
            completed_at = now(), updated_at = now()
      WHERE id = $1`,
    [taskId, documentId]
  );
}

/**
 * Park a finished run for human review (Phase 2). The work is done and the result
 * (comment/document) is already posted by the output nodes; this only flips the
 * status so the card UI can surface Accept / Redo. `completed_at` is stamped so run
 * history shows when the work landed.
 */
export async function parkTaskForReview(taskId: string, documentId: string | null): Promise<void> {
  await db.query(
    `UPDATE agent_tasks
        SET status = 'awaiting_review', result_document_id = $2, error = NULL,
            completed_at = now(), updated_at = now()
      WHERE id = $1`,
    [taskId, documentId]
  );
}

/** Accept a run that was awaiting review → mark it completed. */
export async function acceptReviewTask(taskId: string): Promise<boolean> {
  const rows = await db.query<{ id: string }>(
    `UPDATE agent_tasks
        SET status = 'completed', updated_at = now()
      WHERE id = $1 AND status = 'awaiting_review'
      RETURNING id`,
    [taskId]
  );
  return rows.length > 0;
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

function blocksToPlainText(blocks: CommentBlock[]): string {
  return blocks
    .map((b) => (b.type === 'mention' ? `@${b.displayName ?? ''}` : (b.text ?? '')))
    .join('')
    .trim();
}

/** Author a comment on a card as the Grünerator bot. Returns the new comment id. */
export async function postBotComment(params: PostBotCommentParams): Promise<string> {
  const content = blocksToPlainText(params.blocks);

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

  const rows = await db.query<{ id: string }>(
    `INSERT INTO board_comments (board_id, card_id, parent_id, user_id, content, blocks, mentioned_user_ids)
     VALUES ($1, $2, $3, $4, $5, $6, '{}')
     RETURNING id`,
    [
      params.boardId,
      params.cardId,
      parentId,
      GRUENERATOR_BOT_USER_ID,
      content,
      JSON.stringify(params.blocks),
    ]
  );

  // Surface the bot's comment live to anyone viewing the card.
  void bumpCardComments(params.boardId, params.cardId);

  return rows[0].id;
}

/**
 * Update an existing bot comment in place (used to turn the "working…" comment into
 * the final answer, so a quick reply doesn't leave a redundant ack + answer pair).
 * Guarded to bot-authored comments.
 */
export async function updateBotComment(commentId: string, blocks: CommentBlock[]): Promise<void> {
  const content = blocksToPlainText(blocks);
  const rows = await db.query<{ board_id: string; card_id: string }>(
    `UPDATE board_comments
        SET blocks = $2, content = $3, is_edited = TRUE, edited_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND user_id = $4
      RETURNING board_id, card_id`,
    [commentId, JSON.stringify(blocks), content, GRUENERATOR_BOT_USER_ID]
  );

  // The "working…" comment becoming the answer is the most important live update.
  if (rows[0]) void bumpCardComments(rows[0].board_id, rows[0].card_id);
}
