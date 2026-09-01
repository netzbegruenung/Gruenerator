/**
 * Inhalte mit einer Gruppe teilen — aus dem ts-rest-Handler
 * `groupsContract/content.ts` herausgezogen, aus demselben Grund wie
 * `groupMutations.ts`: die HTTP-Route und die Bestätigungskarte des Chats
 * (`share_notebook` in `confirmController.executeAction`) sollen EINEN Pfad
 * teilen — Besitzprüfung je Typ, Hochstufung eines Notebooks auf
 * share_mode='groups', Doppel-Check, Insert, Benachrichtigung. Der Handler
 * übersetzt nur noch in seinen Contract.
 *
 * Die Mitgliedsprüfung wirft (wie `getPostgresAndCheckMembership`), alles
 * andere kommt als Statuscode zurück — so verhielt sich der Handler, und die
 * Antworten sollen sich durch den Umzug nicht ändern.
 */
import { NotebookQdrantHelper } from '../../database/services/NotebookQdrantHelper.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { getPostgresAndCheckMembership } from '../../routes/auth/groups/groupCore.js';
import { NextcloudShareManager } from '../../utils/integrations/nextcloud/index.js';
import { notifyGroupMembers } from '../notifications/index.js';

import { normalizeSharePermissions } from './groupSharePermissions.js';

import type { PostgresService } from '../../database/services/PostgresService.js';
import type { GroupContentType, ShareContentBody } from '@gruenerator/contracts';

/** Contract-Typ → Tabelle, wo die beiden auseinanderfallen. */
export const CONTENT_TABLE_NAME_MAP: Record<string, string> = {
  database: 'user_templates',
  template: 'user_templates',
  user_templates: 'user_templates',
  instructions: 'user_instructions',
  user_instructions: 'user_instructions',
  canvas_template: 'collaborative_documents',
};

/** Was in der Benachrichtigung „… hat <Label> geteilt" steht. */
export const CONTENT_LABELS: Record<string, string> = {
  documents: 'ein Dokument',
  custom_generators: 'einen Grünerator',
  notebook_collections: 'ein Notebook',
  user_documents: 'einen Text',
  collaborative_documents: 'ein Dokument',
  database: 'einen Datenbank-Eintrag',
  system_notebooks: 'ein Notebook',
  system_agents: 'einen Agenten',
  user_agents: 'eine*n Agent*in',
  canvas_template: 'eine Sharepic-Vorlage',
  nextcloud_share_link: 'eine Wolke-Verbindung',
};

export interface ShareContentToGroupInput {
  userId: string;
  contentType: GroupContentType;
  contentId: string;
  groupId: string;
  permissions: ShareContentBody['permissions'];
  /** Anzeigename für die Benachrichtigung der anderen Mitglieder. */
  sharerName: string;
}

export interface ShareContentOutcome {
  status: 200 | 400 | 403 | 404;
  success: boolean;
  message: string;
}

/** Injizierbar, damit der Test ohne Postgres, Qdrant und Nextcloud läuft. */
export interface ShareContentDeps {
  postgres: Pick<PostgresService, 'queryOne' | 'exec'>;
  /** Wirft, wenn `userId` nicht Mitglied von `groupId` ist. */
  checkMembership: (groupId: string, userId: string) => Promise<void>;
  getNotebookCollection: NotebookQdrantHelper['getNotebookCollection'];
  updateNotebookCollection: NotebookQdrantHelper['updateNotebookCollection'];
  getShareLinkById: typeof NextcloudShareManager.getShareLinkById;
  notify: typeof notifyGroupMembers;
}

let notebookHelperSingleton: NotebookQdrantHelper | null = null;

function defaultDeps(): ShareContentDeps {
  const helper = (notebookHelperSingleton ??= new NotebookQdrantHelper());
  return {
    postgres: getPostgresInstance(),
    checkMembership: async (groupId, userId) => {
      await getPostgresAndCheckMembership(groupId, userId, false);
    },
    getNotebookCollection: (id) => helper.getNotebookCollection(id),
    updateNotebookCollection: (id, patch) => helper.updateNotebookCollection(id, patch),
    getShareLinkById: (userId, id) => NextcloudShareManager.getShareLinkById(userId, id),
    notify: notifyGroupMembers,
  };
}

const NOT_FOUND: ShareContentOutcome = {
  status: 404,
  success: false,
  message: 'Inhalt nicht gefunden.',
};
const NOT_OWNER: ShareContentOutcome = {
  status: 403,
  success: false,
  message: 'Du bist nicht Besitzer*in dieses Inhalts.',
};

export async function shareContentToGroup(
  input: ShareContentToGroupInput,
  deps: ShareContentDeps = defaultDeps()
): Promise<ShareContentOutcome> {
  const { userId, contentType, contentId, groupId, permissions, sharerName } = input;
  const { postgres } = deps;
  await deps.checkMembership(groupId, userId);

  if (contentType === 'nextcloud_share_link') {
    try {
      await deps.getShareLinkById(userId, contentId);
    } catch {
      return { status: 404, success: false, message: 'Wolke-Verbindung nicht gefunden.' };
    }
  }

  if (contentType === 'notebook_collections') {
    const collection = await deps.getNotebookCollection(contentId);
    if (!collection) return NOT_FOUND;
    if (collection.user_id !== userId) return NOT_OWNER;
    // checkNotebookAccess gates group reads on share_mode='groups' AND a
    // group_content_shares row. This generic share path only writes the
    // row, so a private notebook shared here stays unreadable to members
    // ("Kein Zugriff"). Promote it to 'groups' here, mirroring the notebook
    // share modal (setShareMode → addGroupShare). Leave 'authenticated'
    // alone (members already have read access; demoting would narrow the
    // owner's chosen visibility) and 'groups' alone (already correct).
    // Runs before the existing-share guard below so it also heals notebooks
    // that were shared via this path before the fix.
    if (collection.share_mode !== 'groups' && collection.share_mode !== 'authenticated') {
      await deps.updateNotebookCollection(contentId, { share_mode: 'groups' });
    }
  }

  if (
    contentType !== 'system_notebooks' &&
    contentType !== 'system_agents' &&
    contentType !== 'nextcloud_share_link' &&
    contentType !== 'notebook_collections'
  ) {
    const tableName = CONTENT_TABLE_NAME_MAP[contentType] || contentType;
    const ownerColumn =
      contentType === 'collaborative_documents' || contentType === 'canvas_template'
        ? 'created_by'
        : 'user_id';

    let ownershipSQL = `SELECT ${ownerColumn} FROM ${tableName} WHERE id = $1`;
    const ownershipParams: string[] = [contentId];
    if (tableName === 'user_templates') {
      ownershipSQL += ` AND type = $2`;
      ownershipParams.push('template');
    }
    if (contentType === 'collaborative_documents') {
      ownershipSQL += ` AND is_deleted = false`;
    }
    if (contentType === 'canvas_template') {
      ownershipSQL += ` AND is_deleted = false AND document_subtype = 'canvas'`;
    }

    const contentOwnership = await postgres.queryOne<{ [key: string]: string }>(
      ownershipSQL,
      ownershipParams,
      { table: tableName }
    );
    if (!contentOwnership) return NOT_FOUND;
    if (contentOwnership[ownerColumn] !== userId) return NOT_OWNER;
  }

  const existingShare = await postgres.queryOne<{ id: string }>(
    'SELECT id FROM group_content_shares WHERE content_type = $1 AND content_id = $2 AND group_id = $3',
    [contentType, contentId, groupId],
    { table: 'group_content_shares' }
  );
  if (existingShare) {
    return {
      status: 400,
      success: false,
      message: 'Inhalt ist bereits mit dieser Gruppe geteilt.',
    };
  }

  const sharePermissions = normalizeSharePermissions(permissions ?? undefined);
  await postgres.exec(
    'INSERT INTO group_content_shares (content_type, content_id, group_id, shared_by_user_id, permissions) VALUES ($1, $2, $3, $4, $5)',
    [contentType, contentId, groupId, userId, JSON.stringify(sharePermissions)]
  );

  void postgres
    .queryOne('SELECT name FROM groups WHERE id = $1', [groupId], { table: 'groups' })
    .then((g) =>
      deps.notify({
        groupId,
        excludeUserId: userId,
        type: 'group_content_shared',
        title: 'Neuer Inhalt',
        body: `${sharerName} hat ${CONTENT_LABELS[contentType] || 'etwas'} in „${(g as { name?: string } | null)?.name || 'deiner Gruppe'}" geteilt`,
        actionUrl: `/gruppen/${groupId}`,
        metadata: { contentType, contentId },
      })
    )
    .catch(() => {});

  return { status: 200, success: true, message: 'Inhalt erfolgreich mit der Gruppe geteilt.' };
}
