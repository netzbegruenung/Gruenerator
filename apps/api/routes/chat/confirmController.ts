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
import { createMessage, touchThread } from './services/threadPersistenceService.js';

import type { PendingAction } from '../../agents/langgraph/ChatGraph/types.js';

const log = createLogger('ConfirmController');
const router = createAuthenticatedRouter();
router.use(express.json());

/**
 * Execute a confirmed action based on its type.
 * Returns a user-facing result message.
 */
async function executeAction(action: PendingAction): Promise<{ message: string; url?: string }> {
  switch (action.type) {
    case 'save_as_doc': {
      const { createDocumentWithContent } =
        await import('../../services/docs/DocGenerationService.js');
      const { content, title, subtype } = action.payload;

      const newDoc = await createDocumentWithContent(title, content, subtype || 'docs', action.userId);
      return {
        message: `Dokument **"${title}"** wurde erstellt.`,
        url: `/document/${newDoc.id}`,
      };
    }

    case 'modify_doc': {
      const { getPostgresInstance } = await import('../../database/services/PostgresService.js');
      const pg = getPostgresInstance();
      const { docId, newContent } = action.payload;

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
      const { addRowsToBoard } = await import('../../services/boards/BoardService.js');
      const { boardId, rows } = action.payload;

      await addRowsToBoard(boardId, rows, action.userId);
      return {
        message: `Board wurde aktualisiert (${rows.length} Änderung${rows.length !== 1 ? 'en' : ''}).`,
        url: `/boards/${boardId}`,
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

    const userId = (req as any).user?.id as string | undefined;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

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
