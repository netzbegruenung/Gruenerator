/**
 * ts-rest contract router for /api/board-comments
 *
 * Comment threads and emoji reactions on board cards.
 * Mount via mountBoardCommentsContractRouter(app) after requireAuth in routes.ts.
 */

import {
  boardCommentsContract,
  type BoardComment,
  type BoardCommentReply,
  type BoardCommentRow,
  type CommentBlock,
  type CommentReaction,
} from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import { enqueueAgentTask } from '../../services/boards/agentTaskService.js';
import { bumpCardComments } from '../../services/boards/boardLiveSignalService.js';
import { buildCardEmailMetadata } from '../../services/boards/BoardService.js';
import { recordCardActivity } from '../../services/boards/cardActivityService.js';
import { autoSubscribe } from '../../services/boards/cardSubscriptionService.js';
import { GRUENERATOR_BOT_USER_ID } from '../../services/boards/grueneratorBot.js';
import { createNotification } from '../../services/notifications/NotificationService.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';

import { checkBoardAccess } from './boardAccess.js';

import type { Application } from 'express';

const log = createLogger('boardCommentsContract');
const db = getPostgresInstance();

// Row shapes before JS-side enrichment (reactions/replies attached after the query).
type TopLevelCommentRow = Omit<BoardComment, 'reactions' | 'replies'>;
type ReplyRow = Omit<BoardCommentReply, 'reactions'>;

function extractPlainText(blocks: CommentBlock[]): string {
  return blocks
    .map((b) => {
      if (b.type === 'mention') return `@${b.displayName ?? ''}`;
      return b.text ?? '';
    })
    .join('')
    .trim();
}

function extractMentionedUserIds(blocks: CommentBlock[]): string[] {
  return blocks.filter((b) => b.type === 'mention' && b.userId).map((b) => b.userId!);
}

/** The card a comment belongs to, for live-signalling reaction/delete changes. */
async function cardIdForComment(commentId: string): Promise<string | null> {
  const rows = await db.query<{ card_id: string }>(
    `SELECT card_id FROM board_comments WHERE id = $1`,
    [commentId]
  );
  return rows[0]?.card_id ?? null;
}

const s = initServer();

export const boardCommentsContractRouter = s.router(boardCommentsContract, {
  listComments: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const { boardId, cardId } = args.params;

      const { hasAccess } = await checkBoardAccess(boardId, userId);
      if (!hasAccess) return { status: 403 as const, body: { error: 'Kein Zugriff' } };

      const comments = await db.query<TopLevelCommentRow>(
        `SELECT
          bc.*,
          p.display_name AS author_name,
          p.avatar_robot_id AS author_avatar_robot_id,
          (SELECT COUNT(*)::int FROM board_comments r WHERE r.parent_id = bc.id) AS reply_count
         FROM board_comments bc
         LEFT JOIN profiles p ON bc.user_id = p.id
         WHERE bc.board_id = $1 AND bc.card_id = $2 AND bc.parent_id IS NULL
         ORDER BY bc.created_at ASC`,
        [boardId, cardId]
      );

      const commentIds = comments.map((c) => c.id);

      let replyRows: ReplyRow[] = [];
      let reactions: CommentReaction[] = [];

      if (commentIds.length > 0) {
        replyRows = await db.query<ReplyRow>(
          `SELECT
            bc.*,
            p.display_name AS author_name,
            p.avatar_robot_id AS author_avatar_robot_id
           FROM board_comments bc
           LEFT JOIN profiles p ON bc.user_id = p.id
           WHERE bc.parent_id = ANY($1)
           ORDER BY bc.created_at ASC`,
          [commentIds]
        );

        const allIds = [...commentIds, ...replyRows.map((r) => r.id)];
        reactions = await db.query<CommentReaction>(
          `SELECT * FROM board_comment_reactions WHERE comment_id = ANY($1)`,
          [allIds]
        );
      }

      const reactionsByComment = new Map<string, CommentReaction[]>();
      for (const r of reactions) {
        const arr = reactionsByComment.get(r.comment_id) ?? [];
        arr.push(r);
        reactionsByComment.set(r.comment_id, arr);
      }

      const repliesByParent = new Map<string, BoardCommentReply[]>();
      for (const r of replyRows) {
        const reply: BoardCommentReply = { ...r, reactions: reactionsByComment.get(r.id) ?? [] };
        const arr = repliesByParent.get(r.parent_id!) ?? [];
        arr.push(reply);
        repliesByParent.set(r.parent_id!, arr);
      }

      const result: BoardComment[] = comments.map((c) => ({
        ...c,
        reactions: reactionsByComment.get(c.id) ?? [],
        replies: repliesByParent.get(c.id) ?? [],
      }));

      return { status: 200 as const, body: result };
    } catch (error) {
      log.error('Error listing comments', { error: errMsg(error) });
      return { status: 500 as const, body: { error: 'Kommentare konnten nicht geladen werden' } };
    }
  },

  createComment: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const { boardId, cardId } = args.params;
      const { blocks, parentId, agentId } = args.body;

      if (blocks.length === 0) {
        return { status: 400 as const, body: { error: 'Kommentar darf nicht leer sein' } };
      }

      const { hasAccess, boardTitle } = await checkBoardAccess(boardId, userId);
      if (!hasAccess) return { status: 403 as const, body: { error: 'Kein Zugriff' } };

      if (parentId) {
        const parentCheck = await db.query<{ id: string; parent_id: string | null }>(
          `SELECT id, parent_id FROM board_comments WHERE id = $1 AND board_id = $2`,
          [parentId, boardId]
        );
        if (parentCheck.length === 0) {
          return { status: 404 as const, body: { error: 'Elternkommentar nicht gefunden' } };
        }
        if (parentCheck[0].parent_id) {
          return { status: 400 as const, body: { error: 'Nur eine Antwortebene erlaubt' } };
        }
      }

      const content = extractPlainText(blocks);
      const mentionedUserIds = extractMentionedUserIds(blocks);

      const rows = await db.query<BoardCommentRow>(
        `INSERT INTO board_comments (board_id, card_id, parent_id, user_id, content, blocks, mentioned_user_ids)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          boardId,
          cardId,
          parentId ?? null,
          userId,
          content,
          JSON.stringify(blocks),
          mentionedUserIds.length > 0 ? mentionedUserIds : '{}',
        ]
      );

      const comment = rows[0];

      // Mentioning the bot delegates an async task (below). Acknowledge it
      // instantly with a 👍 from the bot on the triggering comment, so the user
      // sees "I'm on it" right away — the actual answer follows from the worker.
      let botReactions: CommentReaction[] = [];
      if (mentionedUserIds.includes(GRUENERATOR_BOT_USER_ID)) {
        botReactions = await db.query<CommentReaction>(
          `INSERT INTO board_comment_reactions (comment_id, user_id, emoji)
           VALUES ($1, $2, '👍')
           ON CONFLICT (comment_id, user_id, emoji) DO NOTHING
           RETURNING *`,
          [comment.id, GRUENERATOR_BOT_USER_ID]
        );
      }

      // Commenter becomes a watcher; record the activity for the unified feed.
      void autoSubscribe(boardId, cardId, userId, 'comment');
      void recordCardActivity({
        boardId,
        cardId,
        userId,
        type: 'comment_added',
        payload: { commentId: comment.id },
      });

      const profile = await db.query<{
        display_name: string | null;
        avatar_robot_id: number | null;
      }>(`SELECT display_name, avatar_robot_id FROM profiles WHERE id = $1`, [userId]);

      const authorName = profile[0]?.display_name ?? 'Unbekannt';
      const result: BoardComment = {
        ...comment,
        author_name: authorName,
        author_avatar_robot_id: profile[0]?.avatar_robot_id ?? null,
        reply_count: 0,
        reactions: botReactions,
        replies: [],
      };

      // Surface the new comment (and any bot 👍) live to other clients.
      void bumpCardComments(boardId, cardId);

      fireCommentNotifications({
        boardId,
        boardTitle: boardTitle ?? 'Board',
        cardId,
        commentId: comment.id,
        authorId: userId,
        authorName,
        content,
        parentId: parentId ?? null,
        mentionedUserIds,
        agentId: agentId ?? null,
      }).catch((err: unknown) => {
        log.warn('Failed to send comment notifications', { error: errMsg(err) });
      });

      return { status: 201 as const, body: result };
    } catch (error) {
      log.error('Error creating comment', { error: errMsg(error) });
      return { status: 500 as const, body: { error: 'Kommentar konnte nicht erstellt werden' } };
    }
  },

  updateComment: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const { commentId } = args.params;
      const { blocks } = args.body;

      if (blocks.length === 0) {
        return { status: 400 as const, body: { error: 'Kommentar darf nicht leer sein' } };
      }

      const existing = await db.query<{ user_id: string }>(
        `SELECT user_id FROM board_comments WHERE id = $1`,
        [commentId]
      );

      if (existing.length === 0) {
        return { status: 404 as const, body: { error: 'Kommentar nicht gefunden' } };
      }
      if (existing[0].user_id !== userId) {
        return { status: 403 as const, body: { error: 'Nur eigene Kommentare bearbeiten' } };
      }

      const content = extractPlainText(blocks);
      const mentionedUserIds = extractMentionedUserIds(blocks);

      const rows = await db.query<BoardCommentRow>(
        `UPDATE board_comments
         SET blocks = $1, content = $2, mentioned_user_ids = $3, is_edited = TRUE, edited_at = CURRENT_TIMESTAMP
         WHERE id = $4
         RETURNING *`,
        [
          JSON.stringify(blocks),
          content,
          mentionedUserIds.length > 0 ? mentionedUserIds : '{}',
          commentId,
        ]
      );

      return { status: 200 as const, body: rows[0] };
    } catch (error) {
      log.error('Error updating comment', { error: errMsg(error) });
      return {
        status: 500 as const,
        body: { error: 'Kommentar konnte nicht aktualisiert werden' },
      };
    }
  },

  deleteComment: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const { boardId, commentId } = args.params;

      const existing = await db.query<{ user_id: string; board_owner: string; card_id: string }>(
        `SELECT bc.user_id, bc.card_id, cd.created_by AS board_owner
         FROM board_comments bc
         JOIN collaborative_documents cd ON cd.id = bc.board_id
         WHERE bc.id = $1 AND bc.board_id = $2`,
        [commentId, boardId]
      );

      if (existing.length === 0) {
        return { status: 404 as const, body: { error: 'Kommentar nicht gefunden' } };
      }

      const isAuthor = existing[0].user_id === userId;
      const isBoardOwner = existing[0].board_owner === userId;
      if (!isAuthor && !isBoardOwner) {
        return { status: 403 as const, body: { error: 'Keine Berechtigung zum Löschen' } };
      }

      await db.query(`DELETE FROM board_comments WHERE id = $1`, [commentId]);

      void bumpCardComments(boardId, existing[0].card_id);

      return { status: 200 as const, body: { success: true } };
    } catch (error) {
      log.error('Error deleting comment', { error: errMsg(error) });
      return { status: 500 as const, body: { error: 'Kommentar konnte nicht gelöscht werden' } };
    }
  },

  addReaction: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const { boardId, commentId } = args.params;
      const { emoji } = args.body;

      const { hasAccess } = await checkBoardAccess(boardId, userId);
      if (!hasAccess) return { status: 403 as const, body: { error: 'Kein Zugriff' } };

      const rows = await db.query<CommentReaction>(
        `INSERT INTO board_comment_reactions (comment_id, user_id, emoji)
         VALUES ($1, $2, $3)
         ON CONFLICT (comment_id, user_id, emoji) DO NOTHING
         RETURNING *`,
        [commentId, userId, emoji]
      );

      if (rows.length === 0) {
        return { status: 200 as const, body: { already_exists: true } };
      }

      const cardId = await cardIdForComment(commentId);
      if (cardId) void bumpCardComments(boardId, cardId);

      return { status: 201 as const, body: rows[0] };
    } catch (error) {
      log.error('Error adding reaction', { error: errMsg(error) });
      return { status: 500 as const, body: { error: 'Reaktion konnte nicht hinzugefügt werden' } };
    }
  },

  removeReaction: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const { boardId, commentId, emoji } = args.params;

      const { hasAccess } = await checkBoardAccess(boardId, userId);
      if (!hasAccess) return { status: 403 as const, body: { error: 'Kein Zugriff' } };

      await db.query(
        `DELETE FROM board_comment_reactions WHERE comment_id = $1 AND user_id = $2 AND emoji = $3`,
        [commentId, userId, decodeURIComponent(emoji)]
      );

      const cardId = await cardIdForComment(commentId);
      if (cardId) void bumpCardComments(boardId, cardId);

      return { status: 200 as const, body: { success: true } };
    } catch (error) {
      log.error('Error removing reaction', { error: errMsg(error) });
      return { status: 500 as const, body: { error: 'Reaktion konnte nicht entfernt werden' } };
    }
  },

  getCommentCount: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const { boardId, cardId } = args.params;

      const { hasAccess } = await checkBoardAccess(boardId, userId);
      if (!hasAccess) return { status: 403 as const, body: { error: 'Kein Zugriff' } };

      const rows = await db.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM board_comments WHERE board_id = $1 AND card_id = $2`,
        [boardId, cardId]
      );

      return { status: 200 as const, body: { count: rows[0]?.count ?? 0 } };
    } catch (error) {
      log.error('Error getting comment count', { error: errMsg(error) });
      return {
        status: 500 as const,
        body: { error: 'Kommentaranzahl konnte nicht geladen werden' },
      };
    }
  },
});

export function mountBoardCommentsContractRouter(app: Application): void {
  createExpressEndpoints(boardCommentsContract, boardCommentsContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'boardCommentsContract'),
  });
}

// ── Notification helpers (fire-and-forget) ────────────────────────────────────

function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface CommentNotificationParams {
  boardId: string;
  boardTitle: string;
  cardId: string;
  commentId: string;
  authorId: string;
  authorName: string;
  content: string;
  parentId: string | null;
  mentionedUserIds: string[];
  /** Specific agent the comment delegated to (own / shared / system); null = default. */
  agentId: string | null;
}

async function fireCommentNotifications(params: CommentNotificationParams): Promise<void> {
  const {
    boardId,
    boardTitle,
    cardId,
    commentId,
    authorId,
    authorName,
    content,
    parentId,
    mentionedUserIds,
    agentId,
  } = params;

  const snippet = content.length > 80 ? content.slice(0, 80) + '…' : content;
  const actionUrl = `/boards/${boardId}?card=${cardId}&comment=${commentId}`;
  const notifiedUserIds = new Set<string>();

  // Card snapshot (once per comment) + the full comment text for the rich email.
  const cardMeta = await buildCardEmailMetadata(boardId, cardId, boardTitle);
  const eventText = content.length > 400 ? `${content.slice(0, 400).trimEnd()}…` : content;

  // Recipient resolution stays sequential (dedup + bot handling), but the
  // notification dispatches run concurrently — matching the attachment fan-out.
  const tasks: Promise<unknown>[] = [];

  for (const mentionedId of mentionedUserIds) {
    if (mentionedId === authorId) continue;

    // Mentioning the bot delegates the comment as an async task instead of
    // sending a notification (the bot has no inbox). Fire-and-forget like the
    // surrounding notification dispatch.
    if (mentionedId === GRUENERATOR_BOT_USER_ID) {
      const localeRows = await db.query<{ locale: string }>(
        `SELECT locale FROM profiles WHERE id = $1`,
        [authorId]
      );
      void enqueueAgentTask({
        boardId,
        cardId,
        triggerCommentId: commentId,
        requestedBy: authorId,
        taskText: content,
        locale: localeRows[0]?.locale ?? 'de-DE',
        agentId,
      }).catch((err: unknown) => {
        log.warn('Failed to enqueue agent task', { error: errMsg(err) });
      });
      continue;
    }

    notifiedUserIds.add(mentionedId);

    tasks.push(
      createNotification({
        userId: mentionedId,
        type: 'board_user_mentioned',
        title: `${authorName} hat dich erwähnt`,
        body: snippet,
        actionUrl,
        metadata: { ...cardMeta, commentId, eventText },
        groupKey: `board-comment-${boardId}-${cardId}`,
      }).catch(() => null)
    );
  }

  if (parentId) {
    const parentRows = await db.query<{ user_id: string }>(
      `SELECT user_id FROM board_comments WHERE id = $1`,
      [parentId]
    );

    const parentAuthorId = parentRows[0]?.user_id;
    if (
      parentAuthorId &&
      parentAuthorId !== authorId &&
      parentAuthorId !== GRUENERATOR_BOT_USER_ID &&
      !notifiedUserIds.has(parentAuthorId)
    ) {
      notifiedUserIds.add(parentAuthorId);

      tasks.push(
        createNotification({
          userId: parentAuthorId,
          type: 'board_comment_reply',
          title: `${authorName} hat auf deinen Kommentar geantwortet`,
          body: snippet,
          actionUrl,
          metadata: { ...cardMeta, commentId, parentId, eventText },
          groupKey: `board-comment-${boardId}-${cardId}`,
        }).catch(() => null)
      );
    }
  }

  const cardCreatorRows = await db.query<{ user_id: string }>(
    `SELECT DISTINCT bc.user_id
     FROM board_comments bc
     WHERE bc.board_id = $1 AND bc.card_id = $2 AND bc.user_id != $3
     LIMIT 20`,
    [boardId, cardId, authorId]
  );

  for (const row of cardCreatorRows) {
    if (row.user_id === GRUENERATOR_BOT_USER_ID) continue;
    if (notifiedUserIds.has(row.user_id)) continue;
    notifiedUserIds.add(row.user_id);

    tasks.push(
      createNotification({
        userId: row.user_id,
        type: 'board_comment_added',
        title: `${authorName} hat in "${boardTitle}" kommentiert`,
        body: snippet,
        actionUrl,
        metadata: { ...cardMeta, commentId, eventText },
        groupKey: `board-comment-${boardId}-${cardId}`,
      }).catch(() => null)
    );
  }

  await Promise.all(tasks);
}
