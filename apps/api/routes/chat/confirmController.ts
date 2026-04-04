/**
 * Confirm Controller
 *
 * Handles user confirmation/rejection of pending actions initiated by the ChatGraph.
 * Actions like "save as document", "modify document", and "modify board" require
 * explicit user approval before executing side effects.
 *
 * Flow:
 * 1. ChatGraph sends confirm_action SSE event with actionId
 * 2. Pending action is stored in Redis (TTL: 5min)
 * 3. Frontend shows confirmation dialog
 * 4. User confirms/rejects via POST /api/chat/confirm
 * 5. On confirm: action is executed and result returned
 * 6. On reject: action is deleted, no side effects
 */

import express from 'express';

import { createAuthenticatedRouter } from '../../utils/keycloak/index.js';
import { createLogger } from '../../utils/logger.js';

import { pendingActionStore } from './services/pendingActionStore.js';
import { getUser, createMessage, touchThread } from './services/threadPersistenceService.js';

import type { PendingAction } from '../../agents/langgraph/ChatGraph/types.js';

const log = createLogger('ConfirmController');
const router = createAuthenticatedRouter();
router.use(express.json());

/**
 * Check if a user has write access to a collaborative_documents row.
 * Checks: owner → direct permission (owner/editor) → group share (write: true).
 */
async function hasWriteAccess(documentId: string, userId: string): Promise<boolean> {
  const { getPostgresInstance } = await import('../../database/services/PostgresService.js');
  const pg = getPostgresInstance();

  const rows = (await pg.query(
    'SELECT created_by, permissions FROM collaborative_documents WHERE id = $1 AND is_deleted = false',
    [documentId]
  )) as { created_by: string; permissions: Record<string, { level: string }> | null }[];

  if (rows.length === 0) return false;

  const doc = rows[0];
  const isOwner = doc.created_by === userId;
  const userPerm = doc.permissions?.[userId];
  if (isOwner || (userPerm && ['owner', 'editor'].includes(userPerm.level))) return true;

  const groupAccess = (await pg.query(
    `SELECT gcs.permissions FROM group_content_shares gcs
     INNER JOIN group_memberships gm ON gm.group_id = gcs.group_id AND gm.user_id = $1
     WHERE gcs.content_type = 'collaborative_documents' AND gcs.content_id = $2 LIMIT 1`,
    [userId, documentId]
  )) as { permissions: { read: boolean; write: boolean } | null }[];

  return groupAccess.length > 0 && groupAccess[0].permissions?.write === true;
}

/**
 * Execute a confirmed action based on its type.
 * Returns a user-facing result message.
 */
async function executeAction(action: PendingAction): Promise<{ message: string; url?: string }> {
  switch (action.type) {
    case 'save_as_doc': {
      const { createDocumentWithContent } =
        await import('../../services/docs/DocGenerationService.js');
      const { markdownToHtml } = await import('../../services/markdown/index.js');
      const { content, title, subtype } = action.payload;

      const htmlContent = markdownToHtml(content);

      const newDoc = await createDocumentWithContent(
        title,
        htmlContent,
        subtype || 'docs',
        action.userId
      );
      return {
        message: `Dokument **"${title}"** wurde erstellt.`,
        url: `/document/${newDoc.id}`,
      };
    }

    case 'modify_doc': {
      const { docId, newContent } = action.payload;

      if (!(await hasWriteAccess(docId, action.userId))) {
        throw new Error('Keine Berechtigung, dieses Dokument zu bearbeiten.');
      }

      const { getPostgresInstance } = await import('../../database/services/PostgresService.js');
      const pg = getPostgresInstance();
      await pg.query(
        'UPDATE collaborative_documents SET content = $1, last_edited_by = $2, updated_at = NOW() WHERE id = $3',
        [newContent, action.userId, docId]
      );
      return {
        message: `Dokument wurde aktualisiert.`,
        url: `/document/${docId}`,
      };
    }

    case 'modify_board': {
      const { boardId, rows } = action.payload;

      if (!(await hasWriteAccess(boardId, action.userId))) {
        throw new Error('Keine Berechtigung, dieses Board zu bearbeiten.');
      }

      const { addRowsToBoard } = await import('../../services/boards/BoardService.js');
      await addRowsToBoard(boardId, rows, action.userId);
      return {
        message: `Board wurde aktualisiert (${rows.length} Änderung${rows.length !== 1 ? 'en' : ''}).`,
        url: `/boards/${boardId}`,
      };
    }

    case 'share_doc': {
      const { docId, docTitle, groupId, groupName, permissionLevel } = action.payload;
      const { getPostgresInstance } = await import('../../database/services/PostgresService.js');
      const pg = getPostgresInstance();

      const doc = (await pg.query(
        'SELECT created_by FROM collaborative_documents WHERE id = $1 AND is_deleted = false',
        [docId]
      )) as { created_by: string }[];

      if (!doc.length || doc[0].created_by !== action.userId) {
        throw new Error('Nur die erstellende Person kann Dokumente teilen.');
      }

      const existing = (await pg.query(
        `SELECT id FROM group_content_shares
         WHERE content_type = 'collaborative_documents' AND content_id = $1 AND group_id = $2`,
        [docId, groupId]
      )) as { id: string }[];

      if (existing.length > 0) {
        throw new Error(`Das Dokument ist bereits mit „${groupName}" geteilt.`);
      }

      const permissions = { read: true, write: permissionLevel === 'editor' };
      await pg.query(
        `INSERT INTO group_content_shares (content_type, content_id, group_id, shared_by_user_id, permissions)
         VALUES ('collaborative_documents', $1, $2, $3, $4)`,
        [docId, groupId, action.userId, JSON.stringify(permissions)]
      );

      import('../../services/notifications/index.js')
        .then(({ notifyGroupMembers }) =>
          notifyGroupMembers({
            groupId,
            excludeUserId: action.userId,
            type: 'group_content_shared',
            title: 'Dokument geteilt',
            body: `Ein Dokument „${docTitle}" wurde mit der Gruppe geteilt`,
            actionUrl: `/docs/${docId}`,
            metadata: { documentId: docId, groupId },
          })
        )
        .catch((err) => log.warn('Failed to notify group members:', err));

      return {
        message: `Dokument **„${docTitle}"** wurde mit **${groupName}** geteilt (${permissionLevel === 'editor' ? 'Bearbeiten' : 'Nur lesen'}).`,
        url: `/document/${docId}`,
      };
    }

    default: {
      const _exhaustive: never = action;
      throw new Error(`Unknown action type: ${(action as PendingAction).type}`);
    }
  }
}

/**
 * POST /api/chat/confirm
 *
 * Confirm or reject a pending action.
 * On confirm: executes the action and persists a result message in the thread.
 * On reject: deletes the pending action silently.
 */
router.post('/', async (req, res) => {
  try {
    const { threadId, actionId, confirmed } = req.body as {
      threadId: string;
      actionId: string;
      confirmed: boolean;
    };

    const user = getUser(req);
    if (!user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const userId = user.id;

    if (!threadId || !actionId) {
      return res.status(400).json({ error: 'threadId and actionId are required' });
    }

    const action = await pendingActionStore.get(threadId, actionId);
    if (!action) {
      return res.status(404).json({
        error: 'Aktion abgelaufen oder nicht gefunden. Bitte versuche es erneut.',
      });
    }

    if (action.userId !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    await pendingActionStore.delete(threadId, actionId);

    if (!confirmed) {
      log.info(`Action ${actionId} (${action.type}) rejected by user`);
      return res.json({ success: true, rejected: true });
    }

    log.info(`Executing confirmed action ${actionId} (${action.type})`);
    const result = await executeAction(action);

    if (threadId) {
      const resultMessage = result.url
        ? `${result.message}\n\n[Öffnen](${result.url})`
        : result.message;
      await createMessage(threadId, 'assistant', resultMessage);
      await touchThread(threadId);
    }

    return res.json({
      success: true,
      message: result.message,
      url: result.url,
    });
  } catch (err) {
    log.error('Confirm action failed:', err);
    return res.status(500).json({
      error: 'Aktion konnte nicht ausgeführt werden.',
    });
  }
});

export default router;
