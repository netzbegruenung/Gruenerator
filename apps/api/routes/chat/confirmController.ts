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

      // One write path: into the live Yjs document, which is what the editor
      // reads. The previous UPDATE on `content` wrote a column no reader in the
      // hydration chain consults — hence "chat reports success, document
      // unchanged". An open editor tab is no longer a reason to refuse; it is
      // the case this path handles best (the change appears without a reload).
      const { replaceDocumentHtml } = await import('../../services/docs/docContentService.js');
      const result = await replaceDocumentHtml(docId, ensureHtml(newContent), {
        userId: action.userId,
      });

      // Report success only after reading the stored state back. `html` is what
      // the endpoint decoded from the document AFTER the write; empty means the
      // new version did not survive block parsing.
      if (!result.html.trim()) {
        throw new ConfirmActionRefusal(
          'Die neue Fassung konnte nicht gespeichert werden — im Dokument steht weiterhin der bisherige Text.'
        );
      }

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

    case 'add_cloud_connection': {
      const { NextcloudShareManager } =
        await import('../../utils/integrations/nextcloud/shareManager.js');
      const { shareLink, label } = action.payload;
      // Derselbe Weg wie die Einstellungsseite (POST /api/nextcloud/share-links):
      // `saveShareLink` validiert erneut und weist einen Doppeleintrag ab. Die
      // Prüfung im Werkzeug ist die Vorschau, nicht die Berechtigung.
      const saved = await NextcloudShareManager.saveShareLink(
        action.userId,
        shareLink,
        label ?? ''
      );
      return {
        message: `Wolke-Verbindung **„${saved.label || action.payload.host}"** wurde hinzugefügt. Der Grünerator liest daraus, schreibt aber nichts.`,
        url: '/settings/wolke',
      };
    }

    case 'attach_wolke_folder': {
      const { NotebookQdrantHelper } =
        await import('../../database/services/NotebookQdrantHelper.js');
      const { attachWolkeFolderToNotebook } =
        await import('../../services/notebook/notebookWolkeAttach.js');
      const { buildNotebookSlug } = await import('@gruenerator/shared/utils');
      const p = action.payload;
      const helper = new NotebookQdrantHelper();

      // Ohne collectionId legt die Karte das Notebook erst an — privat, leer,
      // wie `notebooks` action="create" es auch täte.
      let collectionId = p.collectionId;
      let slugSuffix: string | null = null;
      if (!collectionId) {
        const created = await helper.storeNotebookCollection({
          user_id: action.userId,
          name: p.notebookName,
          description: p.description,
          audience: p.audience,
          settings: { wolke_folders: [], linked_docs: [], wordpress_sites: [] },
          document_count: 0,
        });
        collectionId = created.collection_id;
        slugSuffix = created.slug_suffix;
      } else {
        slugSuffix = (await helper.getNotebookCollection(collectionId))?.slug_suffix ?? null;
      }
      const url = `/notebooks/${slugSuffix ? buildNotebookSlug(p.notebookName, slugSuffix) : collectionId}`;

      try {
        const r = await attachWolkeFolderToNotebook({
          userId: action.userId,
          collectionId,
          shareLinkId: p.shareLinkId,
          folderPath: p.folderPath,
          includeSubfolders: p.includeSubfolders,
        });
        const parts = [`${r.importedNow} sofort ausgelesen`];
        if (r.alreadyImported > 0) parts.push(`${r.alreadyImported} bereits vorhanden`);
        if (r.queued > 0) parts.push(`${r.queued} warten unter „Neue Dateien"`);
        if (r.failed > 0) parts.push(`${r.failed} fehlgeschlagen (ebenfalls dort)`);
        return {
          message: `Ordner **„${r.folderName}"** hängt am Notebook **„${p.notebookName}"** — ${r.total} Datei${r.total === 1 ? '' : 'en'}: ${parts.join(', ')}.`,
          url,
        };
      } catch (err) {
        // Kein 500: Notebook und Ordner-Ref stehen (die Ref wird zuerst
        // geschrieben), nur der Import ist gescheitert. Der stündliche Wächter
        // oder „Synchronisieren" im Notebook holt die Dateien nach.
        log.error('[attach_wolke_folder] import failed after attaching the folder:', err);
        return {
          message: p.collectionId
            ? `Ordner **„${p.folderName}"** hängt am Notebook **„${p.notebookName}"**, der Import ist fehlgeschlagen — im Notebook „Synchronisieren" wählen.`
            : `Notebook **„${p.notebookName}"** wurde angelegt und der Ordner **„${p.folderName}"** angehängt, der Import ist fehlgeschlagen — im Notebook „Synchronisieren" wählen.`,
          url,
        };
      }
    }

    case 'set_notebook_visibility': {
      const { applyNotebookVisibility } =
        await import('../../services/notebook/notebookVisibility.js');
      const { collectionId, notebookName, ...patch } = action.payload;
      const applied = await applyNotebookVisibility(collectionId, action.userId, patch);
      if (!applied.ok) throw new ConfirmActionRefusal(applied.error);
      return {
        message: `Sichtbarkeit von **„${notebookName}"** wurde geändert.`,
        url: `/notebooks/${collectionId}`,
      };
    }

    case 'share_notebook': {
      const { shareContentToGroup } = await import('../../services/groups/groupContent.js');
      const { getPostgresInstance } = await import('../../database/services/PostgresService.js');
      const { collectionId, notebookName, groupId, groupName } = action.payload;
      const rows = (await getPostgresInstance().query(
        'SELECT display_name FROM profiles WHERE id = $1',
        [action.userId]
      )) as { display_name: string | null }[];
      const outcome = await shareContentToGroup({
        userId: action.userId,
        contentType: 'notebook_collections',
        contentId: collectionId,
        groupId,
        permissions: { read: true, write: false },
        sharerName: rows[0]?.display_name || 'Jemand',
      });
      if (!outcome.success) throw new ConfirmActionRefusal(outcome.message);
      return {
        message: `Notebook **„${notebookName}"** wurde mit **„${groupName}"** geteilt.`,
        url: `/gruppen/${groupId}`,
      };
    }

    case 'set_group_visibility': {
      const { setGroupVisibility } = await import('../../services/groups/groupMutations.js');
      const { groupId, groupName, is_public, audience } = action.payload;
      // Wirft bei fehlender Admin-Rolle — der Rollenwechsel zwischen Karte und
      // Klick ist selten, aber die Meldung soll dann die des Dienstes sein.
      let updated: Awaited<ReturnType<typeof setGroupVisibility>>;
      try {
        updated = await setGroupVisibility(groupId, action.userId, { is_public, audience });
      } catch (err) {
        throw new ConfirmActionRefusal(err instanceof Error ? err.message : String(err));
      }
      if (!updated) throw new ConfirmActionRefusal('Gruppe nicht gefunden.');
      return {
        message: updated.is_public
          ? `Projekt **„${groupName}"** ist jetzt öffentlich gelistet.`
          : `Projekt **„${groupName}"** ist jetzt privat.`,
        url: `/gruppen/${groupId}`,
      };
    }

    case 'create_recurring_task': {
      const { createRecurringTask } =
        await import('../../services/recurringTasks/recurringTasksRepository.js');
      const { describeRecurrence, DELIVERY_LABELS_DE, formatNextRun } =
        await import('../../services/recurringTasks/recurringTaskLabels.js');
      const { agentTitle: _agentTitle, ...body } = action.payload;
      const task = await createRecurringTask(action.userId, body);
      // Takt und nächster Lauf gehören in die Zeile: bei einer Beschwerde („die
      // Erinnerung kommt zur falschen Zeit") muss nachvollziehbar sein, ob der
      // Planer oder der Scheduler danebenlag.
      log.info(
        `[ConfirmController] Recurring task created: "${task.title}" (${task.id}) — ` +
          `${describeRecurrence(task.recurrence)}, next=${new Date(task.nextRunAt).toISOString()}`
      );
      return {
        message:
          `Wiederkehrende Aufgabe **„${task.title}"** eingerichtet — läuft ${describeRecurrence(task.recurrence)}, ` +
          `${DELIVERY_LABELS_DE[task.delivery]}. Nächste Ausführung: ${formatNextRun(task.nextRunAt, task.locale)}.`,
        url: '/wiederkehrend',
      };
    }

    case 'create_user_agent': {
      const { createUserAgentSafely, userAgentUrl } = await import('./agents/userAgentTools.js');
      const agent = await createUserAgentSafely(action.userId, action.payload.input);
      log.info(
        `[ConfirmController] User agent created: "${agent.title}" (${agent.identifier}) — ` +
          `tools=[${(agent.enabledTools ?? []).join(',')}] notebooks=${agent.defaultNotebookIds?.length ?? 0}`
      );
      return {
        message: `Grünerator-Agent **„${agent.title}"** angelegt — die Rolle lässt sich jederzeit in den Einstellungen des Agenten oder im Chat verfeinern.`,
        url: userAgentUrl(agent.identifier),
      };
    }

    case 'share_user_agent': {
      const { shareContentToGroup } = await import('../../services/groups/groupContent.js');
      const { getPostgresInstance } = await import('../../database/services/PostgresService.js');
      const { agentTitle, agentId, groupId, groupName } = action.payload;
      const rows = (await getPostgresInstance().query(
        'SELECT display_name FROM profiles WHERE id = $1',
        [action.userId]
      )) as { display_name: string | null }[];
      // Derselbe Pfad wie `userAgentsSharingContractRouter.addGroupShare`:
      // Besitzprüfung über `user_agents.user_id`, Doppel-Check, Insert mit
      // {read, !write} — plus die Benachrichtigung, die der Router nicht schickt.
      const outcome = await shareContentToGroup({
        userId: action.userId,
        contentType: 'user_agents',
        contentId: agentId,
        groupId,
        permissions: { read: true, write: false },
        sharerName: rows[0]?.display_name || 'Jemand',
      });
      if (!outcome.success) throw new ConfirmActionRefusal(outcome.message);
      return {
        message: `Grünerator-Agent **„${agentTitle}"** wurde mit **„${groupName}"** geteilt.`,
        url: `/gruppen/${groupId}`,
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
