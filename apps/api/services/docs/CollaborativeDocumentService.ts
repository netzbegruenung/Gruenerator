/**
 * Shared rename / trash / access logic for the polymorphic
 * `collaborative_documents` table (docs, sheets, presentations, boards, …).
 *
 * Previously this logic was hand-rolled in three places (documentController.ts
 * PUT/DELETE and boardsContractRouter.ts update/delete) with subtly different
 * SQL and a subtype allowlist that accidentally let the /docs route mutate
 * boards. This service is the single implementation; each caller passes the
 * `allowedSubtypes` scope it owns (docs → DOCS_ONLY_SUBTYPES, boards → ['boards']),
 * which is what keeps cross-type mutation impossible.
 *
 * Every function takes an injectable `QueryRunner` so the access/permission
 * branches are unit-testable without a live database.
 */

import { deleteStoredFile } from '../../routes/boards/boardAttachmentStorage.js';
import { reportBackgroundError } from '../../utils/reportBackgroundError.js';
import { type TrashCursor, trashKeysetWhere, trashOrderBy } from '../trash/trashCursor.js';

export type QueryRunner = <T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
) => Promise<T[]>;

export interface PermissionEntry {
  level: 'owner' | 'editor' | 'viewer';
}

export interface CollabDocRow {
  id: string;
  created_by: string;
  permissions: Record<string, PermissionEntry> | null;
  [key: string]: unknown;
}

export type EditAccess =
  | { status: 'not_found' }
  | { status: 'forbidden' }
  | { status: 'ok'; document: CollabDocRow; isOwner: boolean };

/**
 * Resolve edit access to a collaborative document within `allowedSubtypes`.
 * Edit = owner, a direct owner/editor permission, or membership in a group the
 * doc is shared to with write permission.
 */
export async function checkEditAccess(
  runQuery: QueryRunner,
  id: string,
  userId: string,
  allowedSubtypes: string[]
): Promise<EditAccess> {
  const rows = await runQuery<CollabDocRow>(
    'SELECT * FROM collaborative_documents WHERE id = $1 AND document_subtype = ANY($2::text[]) AND is_deleted = false',
    [id, allowedSubtypes]
  );
  if (rows.length === 0) return { status: 'not_found' };

  const document = rows[0];
  const perm = document.permissions?.[userId];
  const isOwner = document.created_by === userId || perm?.level === 'owner';
  let canEdit = isOwner || perm?.level === 'editor';

  if (!canEdit) {
    const groupRows = await runQuery<{ permissions: { read: boolean; write: boolean } | null }>(
      `SELECT gcs.permissions FROM group_content_shares gcs
       INNER JOIN group_memberships gm
         ON gm.group_id = gcs.group_id AND gm.user_id = $1 AND gm.is_active = TRUE
       WHERE gcs.content_type = 'collaborative_documents' AND gcs.content_id = $2 LIMIT 1`,
      [userId, id]
    );
    if (groupRows.length > 0 && groupRows[0].permissions?.write === true) canEdit = true;
  }

  if (!canEdit) return { status: 'forbidden' };
  return { status: 'ok', document, isOwner };
}

export interface UpdateFields {
  // `| undefined` is deliberate: the HTTP boundary (ts-rest nullish body) hands
  // us present-but-undefined keys, which exactOptionalPropertyTypes forbids
  // otherwise. Undefined and null are both treated as "not provided" below.
  title?: string | null | undefined;
  folder_id?: string | null | undefined;
  content?: string | null | undefined;
}

export type UpdateResult =
  { status: 'not_found' } | { status: 'forbidden' } | { status: 'ok'; document: CollabDocRow };

/**
 * Update a document's metadata/editor state after an edit-access check.
 * `null`/`undefined` fields are treated as "not provided" (skipped) — the HTTP
 * layer sends `null` for unset optional fields.
 */
export async function updateCollaborativeDocument(
  runQuery: QueryRunner,
  id: string,
  userId: string,
  allowedSubtypes: string[],
  fields: UpdateFields
): Promise<UpdateResult> {
  const access = await checkEditAccess(runQuery, id, userId, allowedSubtypes);
  if (access.status !== 'ok') return access;

  const setClauses: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (fields.title != null) {
    setClauses.push(`title = $${i++}`);
    values.push(fields.title);
  }
  if (fields.folder_id !== undefined) {
    setClauses.push(`folder_id = $${i++}`);
    values.push(fields.folder_id);
  }
  if (fields.content != null) {
    setClauses.push(`content = $${i++}`);
    values.push(fields.content);
    setClauses.push(`last_edited_by = $${i++}`);
    values.push(userId);
    setClauses.push('last_edited_at = CURRENT_TIMESTAMP');
    setClauses.push('updated_at = CURRENT_TIMESTAMP');
  }
  if (setClauses.length === 0) return { status: 'ok', document: access.document };

  values.push(id);
  const rows = await runQuery<CollabDocRow>(
    `UPDATE collaborative_documents SET ${setClauses.join(', ')} WHERE id = $${i} RETURNING *`,
    values
  );
  return { status: 'ok', document: rows[0] };
}

export type DeleteResult = { status: 'not_found' } | { status: 'forbidden' } | { status: 'ok' };

/**
 * Delete rights: the creator or a `level: 'owner'` permission entry. Trash,
 * restore and purge-now all ask exactly this.
 */
function isDocumentOwner(
  document: Pick<CollabDocRow, 'created_by' | 'permissions'>,
  userId: string
): boolean {
  return document.created_by === userId || document.permissions?.[userId]?.level === 'owner';
}

/**
 * Move a collaborative document to the Papierkorb. Owner only.
 *
 * This is the ONLY writer of `is_deleted = true`: the CHECK
 * `collaborative_documents_trash_pair` requires `deleted_at` to move with it,
 * so a stray `SET is_deleted = true` fails with 23514. `allowedSubtypes`
 * scopes the call to the caller's route (docs must not delete boards); `null`
 * means any subtype.
 */
export async function trashCollaborativeDocument(
  runQuery: QueryRunner,
  id: string,
  userId: string,
  allowedSubtypes: string[] | null
): Promise<DeleteResult> {
  const rows = await runQuery<CollabDocRow>(
    `SELECT created_by, permissions FROM collaborative_documents
     WHERE id = $1 AND ($2::text[] IS NULL OR document_subtype = ANY($2::text[])) AND is_deleted = false`,
    [id, allowedSubtypes]
  );
  if (rows.length === 0) return { status: 'not_found' };
  if (!isDocumentOwner(rows[0], userId)) return { status: 'forbidden' };

  await runQuery(
    `UPDATE collaborative_documents
     SET is_deleted = true, deleted_at = now(), updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND is_deleted = false`,
    [id]
  );
  return { status: 'ok' };
}

export interface TrashedCollabDocRow {
  id: string;
  title: string;
  document_subtype: string | null;
  deleted_at: Date;
}

export type TrashedLookup =
  { status: 'not_found' } | { status: 'forbidden' } | { status: 'ok'; row: TrashedCollabDocRow };

/** A trashed document the user may restore or purge. */
export async function getTrashedCollaborativeDocument(
  runQuery: QueryRunner,
  id: string,
  userId: string
): Promise<TrashedLookup> {
  const rows = await runQuery<
    TrashedCollabDocRow & Pick<CollabDocRow, 'created_by' | 'permissions'>
  >(
    `SELECT id, title, document_subtype, deleted_at, created_by, permissions
     FROM collaborative_documents WHERE id = $1 AND deleted_at IS NOT NULL`,
    [id]
  );
  if (rows.length === 0) return { status: 'not_found' };
  const { created_by, permissions, ...row } = rows[0];
  if (!isDocumentOwner({ created_by, permissions }, userId)) return { status: 'forbidden' };
  return { status: 'ok', row };
}

/** Undo {@link trashCollaborativeDocument}: both columns back, same rights. */
export async function restoreCollaborativeDocument(
  runQuery: QueryRunner,
  id: string,
  userId: string
): Promise<TrashedLookup> {
  const found = await getTrashedCollaborativeDocument(runQuery, id, userId);
  if (found.status !== 'ok') return found;

  await runQuery(
    `UPDATE collaborative_documents SET is_deleted = false, deleted_at = NULL
     WHERE id = $1 AND deleted_at IS NOT NULL`,
    [id]
  );
  return found;
}

/** {@link isDocumentOwner} in SQL. `$1` is the user id. */
const OWNER_SQL = `(created_by::text = $1 OR permissions -> $1 ->> 'level' = 'owner')`;

export async function listTrashedCollaborativeDocuments(
  runQuery: QueryRunner,
  userId: string,
  opts: { limit: number; before: TrashCursor | null }
): Promise<TrashedCollabDocRow[]> {
  const params: unknown[] = [userId];
  const keyset = trashKeysetWhere('deleted_at', 'id', opts.before, params);
  params.push(opts.limit);
  return runQuery<TrashedCollabDocRow>(
    `SELECT id, title, document_subtype, deleted_at FROM collaborative_documents
     WHERE deleted_at IS NOT NULL AND ${OWNER_SQL} AND ${keyset}
     ORDER BY ${trashOrderBy('deleted_at', 'id')}
     LIMIT $${params.length}`,
    params
  );
}

export async function listExpiredCollaborativeDocuments(
  runQuery: QueryRunner,
  cutoff: Date,
  limit: number
): Promise<Array<{ id: string; userId: string | null }>> {
  const rows = await runQuery<{ id: string; created_by: string | null }>(
    `SELECT id, created_by FROM collaborative_documents
     WHERE deleted_at IS NOT NULL AND deleted_at < $1
     ORDER BY deleted_at LIMIT $2`,
    [cutoff, limit]
  );
  return rows.map((r) => ({ id: r.id, userId: r.created_by }));
}

/**
 * Hard-delete a trashed document and everything hanging off it.
 *
 * Order matters: the side-store handles (attachment files, thumbnail share)
 * are read BEFORE the row goes, because the delete cascades their rows away.
 * The delete is conditional — a document restored in the meantime (or never
 * trashed) matches nothing, and then nothing else is touched. After the row is
 * gone every side store is best-effort: a failure is reported, never thrown,
 * because the row cannot come back. `cutoff` null purges any trashed row
 * (purge-now); the worker passes its retention cutoff.
 *
 * Cascades with the row: board_* tables, canvas_documents,
 * canvas_state_versions, chat_thread_canvases, collaborative_documents_init.
 * No FK, cleaned here: Yjs state, group shares, attachment files and the
 * canvas thumbnail share.
 */
export async function purgeCollaborativeDocument(
  runQuery: QueryRunner,
  id: string,
  cutoff: Date | null
): Promise<boolean> {
  const attachments = await runQuery<{ stored_filename: string }>(
    'SELECT stored_filename FROM board_attachments WHERE board_id = $1',
    [id]
  );
  const thumbnails = await runQuery<{ thumbnail_url: string | null }>(
    'SELECT thumbnail_url FROM canvas_documents WHERE document_id = $1',
    [id]
  );

  const deleted = await runQuery<{ id: string }>(
    `DELETE FROM collaborative_documents
     WHERE id = $1 AND deleted_at IS NOT NULL AND ($2::timestamptz IS NULL OR deleted_at < $2)
     RETURNING id`,
    [id, cutoff]
  );
  if (deleted.length === 0) return false;

  const sideStore = async (store: string, work: () => Promise<unknown>): Promise<void> => {
    try {
      await work();
    } catch (error) {
      reportBackgroundError(error, {
        job: 'trash-purge',
        kind: 'collaborative_document',
        id,
        store,
      });
    }
  };

  await sideStore('yjs_document_updates', () =>
    runQuery('DELETE FROM yjs_document_updates WHERE document_id = $1', [id])
  );
  await sideStore('yjs_document_snapshots', () =>
    runQuery('DELETE FROM yjs_document_snapshots WHERE document_id = $1', [id])
  );
  await sideStore('group_content_shares', () =>
    runQuery(
      `DELETE FROM group_content_shares
       WHERE content_type IN ('collaborative_documents', 'canvas_template') AND content_id = $1`,
      [id]
    )
  );
  for (const { stored_filename } of attachments) {
    await sideStore('board_attachments', () => deleteStoredFile(stored_filename));
  }
  const thumbnailUrl = thumbnails[0]?.thumbnail_url;
  if (thumbnailUrl) {
    await sideStore('canvas_thumbnail', async () => {
      const { deleteReplacedThumbnailShare } = await import('../canvas/canvasRepository.js');
      await deleteReplacedThumbnailShare(thumbnailUrl);
    });
  }
  return true;
}
