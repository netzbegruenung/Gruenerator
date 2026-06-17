/**
 * Propagate a board's sharing onto a document the board agent just created.
 *
 * When the @gruenerator agent (comment path or Grünerator-Spalte flow) generates a
 * document for a card, that document is created owned by the requester only. Boards,
 * however, are usually shared — with a group (group_content_shares) and/or with
 * individuals (collaborative_documents.permissions). Without mirroring that sharing the
 * rest of the board members get "no access" on the result. This copies both layers from
 * the board to the document so exactly everyone who can see the board can open the doc.
 *
 * Reuses the existing document access checks unchanged — see
 * routes/docs/documentAccess.ts (checkDirectAccess / checkGroupAccess).
 */
import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('boardSharingService');

const db = getPostgresInstance();

/**
 * Mirror the board's direct permissions and group shares onto the document.
 * Best-effort: logs and swallows on failure (the document is still created and
 * usable by its owner). Idempotent — safe to call more than once per document.
 */
export async function inheritBoardSharingToDocument(
  documentId: string,
  boardId: string
): Promise<void> {
  try {
    // 1) Direct permissions: merge the board's permissions into the document's.
    //    jsonb `||` preserves the existing creator=owner entry; board entries are
    //    layered on top. Mirrors the merge in documentAccess.autoGrantSharePermission.
    const boardRows = (await db.query(
      `SELECT permissions FROM collaborative_documents
       WHERE id = $1 AND document_subtype = 'boards' AND is_deleted = false`,
      [boardId]
    )) as Array<{ permissions: Record<string, unknown> | null }>;

    if (boardRows.length === 0) {
      log.warn(`Board ${boardId} not found; skipping share inheritance for doc ${documentId}`);
      return;
    }

    const boardPermissions = boardRows[0].permissions;
    if (boardPermissions && Object.keys(boardPermissions).length > 0) {
      await db.query(
        `UPDATE collaborative_documents
         SET permissions = COALESCE(permissions, '{}')::jsonb || $1::jsonb,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [JSON.stringify(boardPermissions), documentId]
      );
    }

    // 2) Group shares: copy each of the board's group_content_shares rows to the
    //    document. No unique constraint on the table → guard with NOT EXISTS for
    //    idempotency.
    await db.query(
      `INSERT INTO group_content_shares (content_type, content_id, group_id, shared_by_user_id, permissions)
       SELECT 'collaborative_documents', $1, gcs.group_id, gcs.shared_by_user_id, gcs.permissions
       FROM group_content_shares gcs
       WHERE gcs.content_type = 'collaborative_documents' AND gcs.content_id = $2
         AND NOT EXISTS (
           SELECT 1 FROM group_content_shares existing
           WHERE existing.content_type = 'collaborative_documents'
             AND existing.content_id = $1
             AND existing.group_id = gcs.group_id
         )`,
      [documentId, boardId]
    );

    log.info(`Inherited board ${boardId} sharing onto document ${documentId}`);
  } catch (err) {
    log.warn(
      `Failed to inherit board sharing (board ${boardId} → doc ${documentId}): ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
}
