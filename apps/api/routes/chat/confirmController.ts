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

import { ensureHtml } from '../../services/docs/contentNormalization.js';
import { seedYjsStateSafe } from '../../services/docs/seedYjsState.js';
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
export async function hasWriteAccess(documentId: string, userId: string): Promise<boolean> {
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
     INNER JOIN group_memberships gm ON gm.group_id = gcs.group_id AND gm.user_id = $1 AND gm.is_active = TRUE
     WHERE gcs.content_type = 'collaborative_documents' AND gcs.content_id = $2 LIMIT 1`,
    [userId, documentId]
  )) as { permissions: { read: boolean; write: boolean } | null }[];

  return groupAccess.length > 0 && groupAccess[0].permissions?.write === true;
}

/**
 * A refusal the user can act on — passed through to the card verbatim.
 *
 * The catch-all below answers every failure with "Aktion konnte nicht ausgeführt
 * werden", which is why the two refusals in `modify_doc` (no write access, live
 * Yjs state) read as a dead button: the card said nothing about the editor being
 * the way in. Anything not marked this way stays generic — an unexpected error
 * is not a message we want to hand to the client.
 */
class ConfirmActionRefusal extends Error {
  /**
   * The curated text, held apart from `.message` so no-raw-error-to-client
   * stays meaningful here: the lint rule exists to stop TOOLING output from
   * reaching users, and reading a separate field makes the "this string was
   * written for a user" claim explicit rather than incidental.
   */
  readonly userText: string;

  constructor(userText: string) {
    super(userText);
    this.userText = userText;
  }
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
        throw new ConfirmActionRefusal('Keine Berechtigung, dieses Dokument zu bearbeiten.');
      }

      const { getPostgresInstance } = await import('../../database/services/PostgresService.js');
      const pg = getPostgresInstance();

      // Side-channel writes to `content` while Yjs has live state would diverge
      // from the editor's CRDT. Refuse so the user edits via the collaborative
      // editor instead.
      const liveState = await pg.query(
        `SELECT 1 FROM yjs_document_snapshots WHERE document_id = $1
         UNION ALL
         SELECT 1 FROM yjs_document_updates WHERE document_id = $1
         LIMIT 1`,
        [docId]
      );
      if (liveState.length > 0) {
        throw new ConfirmActionRefusal(
          'Dieses Dokument ist im Editor geöffnet — dort kannst du es direkt ändern. ' +
            'Schließe es und versuch es hier noch einmal.'
        );
      }

      const htmlContent = ensureHtml(newContent);
      await pg.query(
        'UPDATE collaborative_documents SET content = $1, last_edited_by = $2, updated_at = NOW() WHERE id = $3',
        [htmlContent, action.userId, docId]
      );
      // FOLLOW-UP (Yjs-Commit-Pfad): dieser Seed ist für jedes chat-erzeugte
      // Dokument ein garantierter No-op. `seedYjsState` schreibt
      // `collaborative_documents_init` mit ON CONFLICT DO NOTHING, und
      // DocGenerationService hat diese Zeile bei der Erstellung bereits
      // geschrieben. Der Editor hydriert aus Yjs, nicht aus `content` — die
      // Änderung oben landet also in der Spalte und ist im Editor unsichtbar.
      // Beides zusammen ergibt den gemeldeten Befund „Chat meldet Erfolg,
      // Dokument unverändert". Richtig ist EIN Schreibweg: die neue Fassung in
      // den Yjs-Zustand (Update statt DO NOTHING, ggf. über Hocuspocus), mit
      // `content` als abgeleiteter Spiegel. Das fasst den Dokument-Speicherpfad
      // an und bekommt einen eigenen PR.
      await seedYjsStateSafe(docId, htmlContent, 'modify_doc');

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
      const { shareDocumentToGroup } = await import('../../services/docs/shareDocumentToGroup.js');
      return shareDocumentToGroup({
        userId: action.userId,
        docId,
        docTitle,
        groupId,
        groupName,
        permissionLevel,
      });
    }

    case 'create_group': {
      const { createGroupForUser } = await import('../../services/groups/groupMutations.js');
      const { buildGroupSlug } = await import('@gruenerator/shared/utils');

      const group = await createGroupForUser(action.userId, action.payload);
      const slug = group.slug_suffix ? buildGroupSlug(group.name, group.slug_suffix) : group.id;
      return {
        message: `Gruppe **„${group.name}"** wurde erstellt.`,
        url: `/gruppen/${slug}`,
      };
    }

    case 'join_group': {
      const { joinGroupByToken } = await import('../../services/groups/groupMutations.js');
      const { getPostgresInstance } = await import('../../database/services/PostgresService.js');

      const pg = getPostgresInstance();
      const rows = (await pg.query('SELECT display_name FROM profiles WHERE id = $1', [
        action.userId,
      ])) as { display_name: string | null }[];
      const joinerName = rows[0]?.display_name || 'Jemand';

      const outcome = await joinGroupByToken(action.userId, action.payload.joinToken, joinerName);
      if (!outcome) {
        throw new Error('Ungültiger oder abgelaufener Einladungslink.');
      }
      return {
        message: outcome.alreadyMember
          ? `Du bist bereits Mitglied von **„${outcome.group.name}"**.`
          : `Du bist der Gruppe **„${outcome.group.name}"** beigetreten.`,
        url: `/gruppen/${outcome.group.id}`,
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

    if (!confirmed) {
      await pendingActionStore.delete(threadId, actionId);
      log.info(`Action ${actionId} (${action.type}) rejected by user`);
      return res.json({ success: true, rejected: true });
    }

    // Deleted only once the side effect landed. Deleting first turned every
    // refusal into a one-shot: the user read "im Editor geöffnet", closed the
    // editor, pressed again — and got "Aktion abgelaufen", because the card's
    // action was gone the moment it first failed.
    //
    // That survival opens a window for a second confirm (another tab, another
    // device, a double tap) to execute the same action again — and outside
    // `share_doc` nothing downstream deduplicates, so it would be a second
    // document, a second group, a second set of board rows. The claim below is
    // the atomic gate: exactly one request executes, and a failed execution
    // releases it so the retry the comment above describes still works.
    if (!(await pendingActionStore.claim(threadId, actionId))) {
      log.info(`Action ${actionId} (${action.type}) already in flight — refusing duplicate`);
      return res.status(409).json({
        error: 'Diese Aktion läuft bereits. Warte kurz und lade den Chat neu.',
      });
    }

    log.info(`Executing confirmed action ${actionId} (${action.type})`);
    let result: { message: string; url?: string };
    try {
      result = await executeAction(action);
    } catch (err) {
      await pendingActionStore.releaseClaim(threadId, actionId);
      throw err;
    }
    await pendingActionStore.delete(threadId, actionId);

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
    if (err instanceof ConfirmActionRefusal) {
      log.info(`Confirm action refused: ${err.userText}`);
      return res.status(409).json({ error: err.userText });
    }
    log.error('Confirm action failed:', err);
    return res.status(500).json({
      error: 'Aktion konnte nicht ausgeführt werden.',
    });
  }
});

export default router;
