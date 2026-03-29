import { Router, type Request, type Response } from 'express';

import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import { createNotification } from '../../services/notifications/NotificationService.js';
import { createLogger } from '../../utils/logger.js';

const router = Router();
const db = getPostgresInstance();
const log = createLogger('BoardComments');

// ════════════════════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════════════════════

interface BoardAccessResult {
  hasAccess: boolean;
  boardTitle: string | null;
}

async function checkBoardAccess(boardId: string, userId: string): Promise<BoardAccessResult> {
  const rows = (await db.query(
    `SELECT cd.title, cd.created_by, cd.permissions, cd.is_public
     FROM collaborative_documents cd
     WHERE cd.id = $1 AND cd.document_subtype = 'boards' AND cd.is_deleted = false`,
    [boardId]
  )) as Array<{
    title: string;
    created_by: string;
    permissions: Record<string, { level: string }> | null;
    is_public: boolean;
  }>;

  if (rows.length === 0) return { hasAccess: false, boardTitle: null };

  const board = rows[0];
  if (board.created_by === userId || board.is_public || board.permissions?.[userId]) {
    return { hasAccess: true, boardTitle: board.title };
  }

  const groupAccess = (await db.query(
    `SELECT 1 FROM group_content_shares gcs
     INNER JOIN group_memberships gm ON gm.group_id = gcs.group_id AND gm.user_id = $1
     WHERE gcs.content_type = 'collaborative_documents' AND gcs.content_id = $2
     LIMIT 1`,
    [userId, boardId]
  )) as unknown[];

  return { hasAccess: groupAccess.length > 0, boardTitle: board.title };
}

interface CommentBlock {
  type: 'text' | 'mention' | 'link' | 'code';
  text?: string;
  userId?: string;
  displayName?: string;
  url?: string;
}

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

interface CommentRow {
  id: string;
  board_id: string;
  card_id: string;
  parent_id: string | null;
  user_id: string;
  content: string | null;
  blocks: CommentBlock[];
  mentioned_user_ids: string[];
  is_edited: boolean;
  edited_at: string | null;
  created_at: string;
  updated_at: string;
  author_name: string | null;
  author_avatar_robot_id: number | null;
  reply_count?: number;
  reactions?: ReactionRow[];
}

interface ReactionRow {
  id: string;
  comment_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

// ════════════════════════════════════════════════════════════════════════════
// GET /boards/:boardId/cards/:cardId/comments
// ════════════════════════════════════════════════════════════════════════════

router.get(
  '/:boardId/cards/:cardId/comments',
  async (req: Request<{ boardId: string; cardId: string }>, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Nicht authentifiziert' });

      const { boardId, cardId } = req.params;
      const { hasAccess } = await checkBoardAccess(boardId, userId);
      if (!hasAccess) return res.status(403).json({ error: 'Kein Zugriff' });

      const comments = (await db.query(
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
      )) as CommentRow[];

      const commentIds = comments.map((c) => c.id);

      let replies: CommentRow[] = [];
      let reactions: ReactionRow[] = [];

      if (commentIds.length > 0) {
        replies = (await db.query(
          `SELECT
            bc.*,
            p.display_name AS author_name,
            p.avatar_robot_id AS author_avatar_robot_id
           FROM board_comments bc
           LEFT JOIN profiles p ON bc.user_id = p.id
           WHERE bc.parent_id = ANY($1)
           ORDER BY bc.created_at ASC`,
          [commentIds]
        )) as CommentRow[];

        const allIds = [...commentIds, ...replies.map((r) => r.id)];
        reactions = (await db.query(
          `SELECT * FROM board_comment_reactions WHERE comment_id = ANY($1)`,
          [allIds]
        )) as ReactionRow[];
      }

      const reactionsByComment = new Map<string, ReactionRow[]>();
      for (const r of reactions) {
        const arr = reactionsByComment.get(r.comment_id) ?? [];
        arr.push(r);
        reactionsByComment.set(r.comment_id, arr);
      }

      const repliesByParent = new Map<string, CommentRow[]>();
      for (const r of replies) {
        r.reactions = reactionsByComment.get(r.id) ?? [];
        const arr = repliesByParent.get(r.parent_id!) ?? [];
        arr.push(r);
        repliesByParent.set(r.parent_id!, arr);
      }

      const result = comments.map((c) => ({
        ...c,
        reactions: reactionsByComment.get(c.id) ?? [],
        replies: repliesByParent.get(c.id) ?? [],
      }));

      return res.json(result);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      log.error('Error listing comments', { error: msg });
      return res.status(500).json({ error: 'Kommentare konnten nicht geladen werden' });
    }
  }
);

// ════════════════════════════════════════════════════════════════════════════
// POST /boards/:boardId/cards/:cardId/comments
// ════════════════════════════════════════════════════════════════════════════

router.post(
  '/:boardId/cards/:cardId/comments',
  async (req: Request<{ boardId: string; cardId: string }>, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Nicht authentifiziert' });

      const { boardId, cardId } = req.params;
      const { blocks, parentId } = req.body as {
        blocks: CommentBlock[];
        parentId?: string;
      };

      if (!Array.isArray(blocks) || blocks.length === 0) {
        return res.status(400).json({ error: 'Kommentar darf nicht leer sein' });
      }

      const { hasAccess, boardTitle } = await checkBoardAccess(boardId, userId);
      if (!hasAccess) return res.status(403).json({ error: 'Kein Zugriff' });

      if (parentId) {
        const parentCheck = (await db.query(
          `SELECT id, parent_id FROM board_comments WHERE id = $1 AND board_id = $2`,
          [parentId, boardId]
        )) as Array<{ id: string; parent_id: string | null }>;

        if (parentCheck.length === 0) {
          return res.status(404).json({ error: 'Elternkommentar nicht gefunden' });
        }
        if (parentCheck[0].parent_id) {
          return res.status(400).json({ error: 'Nur eine Antwortebene erlaubt' });
        }
      }

      const content = extractPlainText(blocks);
      const mentionedUserIds = extractMentionedUserIds(blocks);

      const rows = (await db.query(
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
      )) as CommentRow[];

      const comment = rows[0];

      const profile = (await db.query(
        `SELECT display_name, avatar_robot_id FROM profiles WHERE id = $1`,
        [userId]
      )) as Array<{ display_name: string | null; avatar_robot_id: number | null }>;

      const authorName = profile[0]?.display_name ?? 'Unbekannt';
      const result = {
        ...comment,
        author_name: authorName,
        author_avatar_robot_id: profile[0]?.avatar_robot_id ?? null,
        reply_count: 0,
        reactions: [],
        replies: [],
      };

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
      }).catch((err) => {
        log.warn('Failed to send comment notifications', { error: err.message });
      });

      return res.status(201).json(result);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      log.error('Error creating comment', { error: msg });
      return res.status(500).json({ error: 'Kommentar konnte nicht erstellt werden' });
    }
  }
);

// ════════════════════════════════════════════════════════════════════════════
// PUT /boards/:boardId/comments/:commentId
// ════════════════════════════════════════════════════════════════════════════

router.put(
  '/:boardId/comments/:commentId',
  async (req: Request<{ boardId: string; commentId: string }>, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Nicht authentifiziert' });

      const { commentId } = req.params;
      const { blocks } = req.body as { blocks: CommentBlock[] };

      if (!Array.isArray(blocks) || blocks.length === 0) {
        return res.status(400).json({ error: 'Kommentar darf nicht leer sein' });
      }

      const existing = (await db.query(`SELECT user_id FROM board_comments WHERE id = $1`, [
        commentId,
      ])) as Array<{ user_id: string }>;

      if (existing.length === 0) return res.status(404).json({ error: 'Kommentar nicht gefunden' });
      if (existing[0].user_id !== userId) {
        return res.status(403).json({ error: 'Nur eigene Kommentare bearbeiten' });
      }

      const content = extractPlainText(blocks);
      const mentionedUserIds = extractMentionedUserIds(blocks);

      const rows = (await db.query(
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
      )) as CommentRow[];

      return res.json(rows[0]);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      log.error('Error updating comment', { error: msg });
      return res.status(500).json({ error: 'Kommentar konnte nicht aktualisiert werden' });
    }
  }
);

// ════════════════════════════════════════════════════════════════════════════
// DELETE /boards/:boardId/comments/:commentId
// ════════════════════════════════════════════════════════════════════════════

router.delete(
  '/:boardId/comments/:commentId',
  async (req: Request<{ boardId: string; commentId: string }>, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Nicht authentifiziert' });

      const { boardId, commentId } = req.params;

      const existing = (await db.query(
        `SELECT bc.user_id, cd.created_by AS board_owner
         FROM board_comments bc
         JOIN collaborative_documents cd ON cd.id = bc.board_id
         WHERE bc.id = $1 AND bc.board_id = $2`,
        [commentId, boardId]
      )) as Array<{ user_id: string; board_owner: string }>;

      if (existing.length === 0) return res.status(404).json({ error: 'Kommentar nicht gefunden' });

      const isAuthor = existing[0].user_id === userId;
      const isBoardOwner = existing[0].board_owner === userId;
      if (!isAuthor && !isBoardOwner) {
        return res.status(403).json({ error: 'Keine Berechtigung zum Löschen' });
      }

      await db.query(`DELETE FROM board_comments WHERE id = $1`, [commentId]);

      return res.json({ success: true });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      log.error('Error deleting comment', { error: msg });
      return res.status(500).json({ error: 'Kommentar konnte nicht gelöscht werden' });
    }
  }
);

// ════════════════════════════════════════════════════════════════════════════
// POST /boards/:boardId/comments/:commentId/reactions
// ════════════════════════════════════════════════════════════════════════════

router.post(
  '/:boardId/comments/:commentId/reactions',
  async (req: Request<{ boardId: string; commentId: string }>, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Nicht authentifiziert' });

      const { boardId, commentId } = req.params;
      const { emoji } = req.body as { emoji: string };

      if (!emoji || typeof emoji !== 'string') {
        return res.status(400).json({ error: 'Emoji ist erforderlich' });
      }

      const { hasAccess } = await checkBoardAccess(boardId, userId);
      if (!hasAccess) return res.status(403).json({ error: 'Kein Zugriff' });

      const rows = (await db.query(
        `INSERT INTO board_comment_reactions (comment_id, user_id, emoji)
         VALUES ($1, $2, $3)
         ON CONFLICT (comment_id, user_id, emoji) DO NOTHING
         RETURNING *`,
        [commentId, userId, emoji]
      )) as ReactionRow[];

      if (rows.length === 0) {
        return res.json({ already_exists: true });
      }

      return res.status(201).json(rows[0]);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      log.error('Error adding reaction', { error: msg });
      return res.status(500).json({ error: 'Reaktion konnte nicht hinzugefügt werden' });
    }
  }
);

// ════════════════════════════════════════════════════════════════════════════
// DELETE /boards/:boardId/comments/:commentId/reactions/:emoji
// ════════════════════════════════════════════════════════════════════════════

router.delete(
  '/:boardId/comments/:commentId/reactions/:emoji',
  async (req: Request<{ boardId: string; commentId: string; emoji: string }>, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Nicht authentifiziert' });

      const { commentId, emoji } = req.params;

      await db.query(
        `DELETE FROM board_comment_reactions WHERE comment_id = $1 AND user_id = $2 AND emoji = $3`,
        [commentId, userId, decodeURIComponent(emoji)]
      );

      return res.json({ success: true });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      log.error('Error removing reaction', { error: msg });
      return res.status(500).json({ error: 'Reaktion konnte nicht entfernt werden' });
    }
  }
);

// ════════════════════════════════════════════════════════════════════════════
// GET /boards/:boardId/cards/:cardId/comment-count
// ════════════════════════════════════════════════════════════════════════════

router.get(
  '/:boardId/cards/:cardId/comment-count',
  async (req: Request<{ boardId: string; cardId: string }>, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Nicht authentifiziert' });

      const { boardId, cardId } = req.params;

      const rows = (await db.query(
        `SELECT COUNT(*)::int AS count FROM board_comments WHERE board_id = $1 AND card_id = $2`,
        [boardId, cardId]
      )) as Array<{ count: number }>;

      return res.json({ count: rows[0]?.count ?? 0 });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      log.error('Error getting comment count', { error: msg });
      return res.status(500).json({ error: 'Kommentaranzahl konnte nicht geladen werden' });
    }
  }
);

// ════════════════════════════════════════════════════════════════════════════
// Notification helpers (fire-and-forget)
// ════════════════════════════════════════════════════════════════════════════

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
  } = params;

  const snippet = content.length > 80 ? content.slice(0, 80) + '…' : content;
  const actionUrl = `/boards/${boardId}?card=${cardId}&comment=${commentId}`;
  const notifiedUserIds = new Set<string>();

  for (const mentionedId of mentionedUserIds) {
    if (mentionedId === authorId) continue;
    notifiedUserIds.add(mentionedId);

    await createNotification({
      userId: mentionedId,
      type: 'board_user_mentioned',
      title: `${authorName} hat dich erwähnt`,
      body: snippet,
      actionUrl,
      metadata: { boardId, cardId, commentId },
      groupKey: `board-comment-${boardId}-${cardId}`,
    });
  }

  if (parentId) {
    const parentRows = (await db.query(`SELECT user_id FROM board_comments WHERE id = $1`, [
      parentId,
    ])) as Array<{ user_id: string }>;

    const parentAuthorId = parentRows[0]?.user_id;
    if (parentAuthorId && parentAuthorId !== authorId && !notifiedUserIds.has(parentAuthorId)) {
      notifiedUserIds.add(parentAuthorId);

      await createNotification({
        userId: parentAuthorId,
        type: 'board_comment_reply',
        title: `${authorName} hat auf deinen Kommentar geantwortet`,
        body: snippet,
        actionUrl,
        metadata: { boardId, cardId, commentId, parentId },
        groupKey: `board-comment-${boardId}-${cardId}`,
      });
    }
  }

  const cardCreatorRows = (await db.query(
    `SELECT DISTINCT bc.user_id
     FROM board_comments bc
     WHERE bc.board_id = $1 AND bc.card_id = $2 AND bc.user_id != $3
     LIMIT 20`,
    [boardId, cardId, authorId]
  )) as Array<{ user_id: string }>;

  for (const row of cardCreatorRows) {
    if (notifiedUserIds.has(row.user_id)) continue;
    notifiedUserIds.add(row.user_id);

    await createNotification({
      userId: row.user_id,
      type: 'board_comment_added',
      title: `${authorName} hat in "${boardTitle}" kommentiert`,
      body: snippet,
      actionUrl,
      metadata: { boardId, cardId, commentId },
      groupKey: `board-comment-${boardId}-${cardId}`,
    });
  }
}

export default router;
