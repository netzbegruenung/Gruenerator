import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('ShareDocumentToGroup');

/**
 * Share a collaborative document with a group (owner-only). Shared by the chat
 * confirm flow (`share_doc` pending action) and the MCP server's documents tool.
 * Throws user-facing German errors on permission/duplicate failures.
 */
export async function shareDocumentToGroup(opts: {
  userId: string;
  docId: string;
  docTitle: string;
  groupId: string;
  groupName: string;
  permissionLevel: string;
}): Promise<{ message: string; url: string }> {
  const { userId, docId, docTitle, groupId, groupName, permissionLevel } = opts;
  const pg = getPostgresInstance();

  const doc = (await pg.query(
    'SELECT created_by FROM collaborative_documents WHERE id = $1 AND is_deleted = false',
    [docId]
  )) as { created_by: string }[];

  if (!doc.length || doc[0].created_by !== userId) {
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
    [docId, groupId, userId, JSON.stringify(permissions)]
  );

  import('../notifications/index.js')
    .then(({ notifyGroupMembers }) =>
      notifyGroupMembers({
        groupId,
        excludeUserId: userId,
        type: 'group_content_shared',
        title: 'Dokument geteilt',
        body: `Ein Dokument „${docTitle}" wurde mit der Gruppe geteilt`,
        actionUrl: `/office/${docId}`,
        metadata: { documentId: docId, groupId },
      })
    )
    .catch((err) => log.warn('Failed to notify group members:', err));

  return {
    message: `Dokument **„${docTitle}"** wurde mit **${groupName}** geteilt (${permissionLevel === 'editor' ? 'Bearbeiten' : 'Nur lesen'}).`,
    url: `/document/${docId}`,
  };
}
