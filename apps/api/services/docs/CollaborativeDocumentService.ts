/**
 * Shared rename / soft-delete / access logic for the polymorphic
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
  title?: string | null;
  folder_id?: string | null;
  content?: string | null;
  wolke_live_sync?: boolean | null;
}

export type UpdateResult =
  | { status: 'not_found' }
  | { status: 'forbidden' }
  | { status: 'ok'; document: CollabDocRow };

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
  if (fields.wolke_live_sync != null) {
    setClauses.push(`wolke_live_sync = $${i++}`);
    values.push(fields.wolke_live_sync);
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
 * Soft-delete a collaborative document within `allowedSubtypes`. Owner only
 * (creator or a `level: 'owner'` permission entry).
 */
export async function softDeleteCollaborativeDocument(
  runQuery: QueryRunner,
  id: string,
  userId: string,
  allowedSubtypes: string[]
): Promise<DeleteResult> {
  const rows = await runQuery<CollabDocRow>(
    'SELECT created_by, permissions FROM collaborative_documents WHERE id = $1 AND document_subtype = ANY($2::text[]) AND is_deleted = false',
    [id, allowedSubtypes]
  );
  if (rows.length === 0) return { status: 'not_found' };

  const document = rows[0];
  const isOwner =
    document.created_by === userId || document.permissions?.[userId]?.level === 'owner';
  if (!isOwner) return { status: 'forbidden' };

  await runQuery(
    'UPDATE collaborative_documents SET is_deleted = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
    [id]
  );
  return { status: 'ok' };
}
