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
import { type RunVerdict } from '../backgroundRuns/runVerifier.js';

import { bumpCardComments } from './boardLiveSignalService.js';
import { GRUENERATOR_BOT_USER_ID } from './grueneratorBot.js';

const db = getPostgresInstance();
const log = createLogger('agentTaskService');

// A task left in 'running' longer than this is assumed to belong to a crashed
// worker and becomes claimable again (the attempt was already counted at claim).
const STALE_RUNNING_MINUTES = 10;

// Decken für den vollen Loop (#3221). Erster Lauf plus Reparatur-Runde plus zwei
// Prüfungen, Quelle und Ausgabe müssen sicher unter STALE_RUNNING_MINUTES
// bleiben — sonst holt ein anderer Worker die noch laufende Aufgabe erneut.
export const BOARD_TURN_DEADLINE_MS = 240_000;
export const BOARD_REPAIR_DEADLINE_MS = 180_000;

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

/**
 * The instruction for a card a person gave no written ask for: assigned to an
 * agent, or created by a decomposing run that also works it (#3549). It anchors
 * the agent to the card's title + description — without that anchor a strong
 * agent persona drifts to something unrelated to the board. The worker adds the
 * full card context (column, comments, documents) on top.
 */
export function cardTaskText(cardTitle: string | null, cardDescription: string | null): string {
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
         -- Rückzieh-Pause: ein frisch fehlgeschlagener Versuch wartet
         -- attempts*2 Minuten, statt sofort im nächsten 5-Sekunden-Tick wieder
         -- zu starten. attempts = 0 heisst „noch nie versucht" → sofort.
         WHERE ((status = 'pending' AND updated_at <= now() - make_interval(mins => attempts * 2))
            -- Die attempts-Bedingung ist load-bearing: der Übergang nach
            -- 'failed' liegt allein im catch des Workers, den ein Absturz nie
            -- erreicht. Ohne die Bedingung kreist eine Aufgabe, die den Prozess
            -- tötet, für immer: holen, abstürzen, 10 Minuten, holen.
            OR (status = 'running' AND started_at < now() - make_interval(mins => $1)
                AND attempts < max_attempts))
         -- Graph (#3549): a task waits in 'pending' until every predecessor has
         -- delivered. awaiting_review counts — the result exists, the review
         -- note sits on the predecessor's card.
         AND NOT EXISTS (
           SELECT 1 FROM agent_task_dependencies d
             JOIN agent_tasks p ON p.id = d.depends_on_task_id
            WHERE d.task_id = agent_tasks.id
              AND p.status NOT IN ('completed', 'awaiting_review'))
         ORDER BY created_at
         FOR UPDATE SKIP LOCKED
         LIMIT 1
      )
      RETURNING *`,
    [STALE_RUNNING_MINUTES]
  );
  return rows[0] ?? null;
}

export async function completeAgentTask(
  taskId: string,
  documentId: string | null,
  verdict: RunVerdict | null = null
): Promise<void> {
  await db.query(
    `UPDATE agent_tasks
        SET status = 'completed', result_document_id = $2, error = NULL, verdict = $3,
            completed_at = now(), updated_at = now()
      WHERE id = $1`,
    [taskId, documentId, verdict ? JSON.stringify(verdict) : null]
  );
}

/**
 * Park a finished run for human review — either because the schedule asked for it
 * (`require_review`) or because the result check still objected after the repair
 * round (#3221). The work is done and the result (comment/document) is already
 * posted by the output nodes; this only flips the status so the card UI can
 * surface Accept / Redo. `completed_at` is stamped so run
 * history shows when the work landed.
 */
export async function parkTaskForReview(
  taskId: string,
  documentId: string | null,
  verdict: RunVerdict | null = null
): Promise<void> {
  await db.query(
    `UPDATE agent_tasks
        SET status = 'awaiting_review', result_document_id = $2, error = NULL, verdict = $3,
            completed_at = now(), updated_at = now()
      WHERE id = $1`,
    [taskId, documentId, verdict ? JSON.stringify(verdict) : null]
  );
}

/**
 * Accept a run that was awaiting review → mark it completed.
 * Scoped by `board_id` so a caller authorized on one board cannot accept a
 * review task belonging to another board by passing its task id (IDOR).
 */
export async function acceptReviewTask(taskId: string, boardId: string): Promise<boolean> {
  const rows = await db.query<{ id: string }>(
    `UPDATE agent_tasks
        SET status = 'completed', updated_at = now()
      WHERE id = $1 AND board_id = $2 AND status = 'awaiting_review'
      RETURNING id`,
    [taskId, boardId]
  );
  return rows.length > 0;
}

/**
 * Räumt Aufgaben ab, die ihre Versuche aufgebraucht haben und deren Lauf ein
 * Absturz mitgerissen hat. Der Endstatus 'failed' wird sonst nur im catch des
 * Workers gesetzt — und genau der läuft nicht mehr, wenn der Prozess stirbt.
 * Gibt die abgeräumten Aufgaben zurück, damit der Worker je eine
 * Fehlschlag-Benachrichtigung senden kann.
 */
export async function sweepDeadAgentTasks(): Promise<AgentTask[]> {
  return db.query<AgentTask>(
    `UPDATE agent_tasks
        SET status = 'failed',
            error = COALESCE(error, 'Lauf abgebrochen: der Dienst wurde neu gestartet, während er lief.'),
            completed_at = now(), updated_at = now()
      WHERE status = 'running'
        AND started_at < now() - make_interval(mins => $1)
        AND attempts >= max_attempts
      RETURNING *`,
    [STALE_RUNNING_MINUTES]
  );
}

/**
 * Fails every pending task whose predecessor failed for good (#3549). Without
 * this it would sit in 'pending' forever, skipped by the claim query. Covers one
 * level per call; the worker repeats it until nothing is left, so a chain fails
 * through within one tick.
 */
export async function failTasksBlockedByFailure(): Promise<AgentTask[]> {
  return db.query<AgentTask>(
    `UPDATE agent_tasks t
        SET status = 'failed',
            error = 'Abgebrochen: eine vorausgehende Aufgabe ist fehlgeschlagen.',
            completed_at = now(), updated_at = now()
      WHERE t.status = 'pending'
        AND EXISTS (
          SELECT 1 FROM agent_task_dependencies d
            JOIN agent_tasks p ON p.id = d.depends_on_task_id
           WHERE d.task_id = t.id AND p.status = 'failed')
      RETURNING t.*`
  );
}

export interface ChildAgentTask {
  cardId: string;
  taskText: string;
  /** Positions in the same list this child waits for. Must point backwards. */
  dependsOn: number[];
}

/**
 * Completes a decomposing run and queues one task per card it should also work
 * (#3549) — in one transaction, so a crash can't leave the children queued with
 * the parent still retryable (which would queue them a second time). Children
 * inherit board, requester, locale and agent from the parent.
 */
export async function completeWithChildAgentTasks(
  parent: AgentTask,
  children: ChildAgentTask[]
): Promise<void> {
  await db.transaction(async (client) => {
    const ids: string[] = [];
    for (const child of children) {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO agent_tasks (board_id, card_id, requested_by, task_text, locale, agent_id, parent_task_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          parent.board_id,
          child.cardId,
          parent.requested_by,
          child.taskText,
          parent.locale,
          parent.agent_id,
          parent.id,
        ]
      );
      ids.push(rows[0].id);
    }
    const edges = children.flatMap((child, i) =>
      child.dependsOn.filter((d) => d < i).map((d) => [ids[i], ids[d]] as const)
    );
    if (edges.length > 0) {
      await client.query(
        `INSERT INTO agent_task_dependencies (task_id, depends_on_task_id)
         SELECT * FROM unnest($1::uuid[], $2::uuid[])`,
        [edges.map((e) => e[0]), edges.map((e) => e[1])]
      );
    }
    await client.query(
      `UPDATE agent_tasks
          SET status = 'completed', error = NULL, completed_at = now(), updated_at = now()
        WHERE id = $1`,
      [parent.id]
    );
  });
  log.info(`Agent task ${parent.id} queued ${children.length} child task(s)`);
}

/**
 * What a child task needs from the graph (#3549): the request it was split
 * from, and the cards of the tasks it waits for — their results feed its context.
 */
export async function taskGraphContext(
  task: AgentTask
): Promise<{ parentTaskText: string | null; predecessorCardIds: string[] }> {
  const [parent, predecessors] = await Promise.all([
    task.parent_task_id
      ? db.query<{ task_text: string }>(`SELECT task_text FROM agent_tasks WHERE id = $1`, [
          task.parent_task_id,
        ])
      : Promise.resolve([]),
    db.query<{ card_id: string }>(
      `SELECT p.card_id FROM agent_task_dependencies d
         JOIN agent_tasks p ON p.id = d.depends_on_task_id
        WHERE d.task_id = $1`,
      [task.id]
    ),
  ]);
  return {
    parentTaskText: parent[0]?.task_text ?? null,
    predecessorCardIds: predecessors.map((r) => r.card_id),
  };
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
