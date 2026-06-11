/**
 * Centralized read/edit access checks for user-owned notebook collections.
 *
 * Mirrors apps/api/routes/docs/documentAccess.ts but adapted to the
 * Qdrant-backed notebook collections + the polymorphic group_content_shares
 * table. See plan: /home/morit/.claude/plans/docs-can-be-made-majestic-pillow.md
 */

import { NotebookQdrantHelper } from '../../database/services/NotebookQdrantHelper.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';

const helper = new NotebookQdrantHelper();

export interface NotebookAccess {
  exists: boolean;
  isOwner: boolean;
  canRead: boolean;
  canEdit: boolean;
}

const DENIED: NotebookAccess = { exists: false, isOwner: false, canRead: false, canEdit: false };

interface GroupShareRow {
  group_id: string;
  [key: string]: unknown;
}

interface MembershipRow {
  role: string;
  is_creator: boolean;
  [key: string]: unknown;
}

async function getSharedGroupIds(notebookId: string): Promise<string[]> {
  const postgres = getPostgresInstance();
  const rows = (await postgres.query(
    `SELECT group_id FROM group_content_shares
       WHERE content_type = 'notebook_collections' AND content_id = $1`,
    [notebookId]
  )) as GroupShareRow[];
  return rows.map((r) => r.group_id);
}

async function getMembershipsForUserInGroups(
  userId: string,
  groupIds: string[]
): Promise<MembershipRow[]> {
  if (groupIds.length === 0) return [];
  const postgres = getPostgresInstance();
  return (await postgres.query(
    `SELECT gm.role, (g.created_by = gm.user_id) AS is_creator
       FROM group_memberships gm
       INNER JOIN groups g ON g.id = gm.group_id
       WHERE gm.user_id = $1 AND gm.group_id = ANY($2)`,
    [userId, groupIds]
  )) as MembershipRow[];
}

/**
 * Decide what `userId` can do with `notebookId`.
 *
 * Read:
 *   - owner → always
 *   - share_mode = 'authenticated' + userId present → yes
 *   - share_mode = 'groups' + userId is a member of a shared group → yes
 *   - otherwise → no
 *
 * Edit (only meaningful when canRead = true):
 *   - owner → always
 *   - edit_policy = 'owner_only' → no
 *   - edit_policy = 'group_admins' → user must be admin OR creator of a shared group
 *   - edit_policy = 'all_members' → user must be a member of a shared group
 *
 * Note: share_mode = 'authenticated' WITHOUT shared groups effectively falls
 * back to owner-only edits, because edit_policy needs a shared-groups set to
 * grant rights to anyone other than the owner. The frontend renders a hint.
 */
export async function checkNotebookAccess(
  notebookId: string,
  userId: string | null
): Promise<NotebookAccess> {
  const collection = await helper.getNotebookCollection(notebookId);
  if (!collection) return DENIED;

  const isOwner = userId !== null && collection.user_id === userId;
  if (isOwner) {
    return { exists: true, isOwner: true, canRead: true, canEdit: true };
  }

  const shareMode = collection.share_mode;
  const editPolicy = collection.edit_policy;

  if (shareMode === 'authenticated') {
    if (!userId) return { exists: true, isOwner: false, canRead: false, canEdit: false };
    return { exists: true, isOwner: false, canRead: true, canEdit: false };
  }

  if (shareMode === 'groups') {
    if (!userId) return { exists: true, isOwner: false, canRead: false, canEdit: false };
    const sharedGroupIds = await getSharedGroupIds(notebookId);
    if (sharedGroupIds.length === 0) {
      return { exists: true, isOwner: false, canRead: false, canEdit: false };
    }
    const memberships = await getMembershipsForUserInGroups(userId, sharedGroupIds);
    if (memberships.length === 0) {
      return { exists: true, isOwner: false, canRead: false, canEdit: false };
    }

    let canEdit = false;
    if (editPolicy === 'all_members') {
      canEdit = true;
    } else if (editPolicy === 'group_admins') {
      canEdit = memberships.some((m) => m.role === 'admin' || m.is_creator);
    }
    return { exists: true, isOwner: false, canRead: true, canEdit };
  }

  return { exists: true, isOwner: false, canRead: false, canEdit: false };
}

/**
 * Convenience guard for read endpoints. Returns a 403/404-shaped object
 * the caller can return directly when access is denied; otherwise null when
 * the user is allowed to proceed.
 */
export async function requireNotebookRead(
  notebookId: string,
  userId: string | null
): Promise<{ status: 403 | 404; body: { error: string } } | null> {
  const access = await checkNotebookAccess(notebookId, userId);
  if (!access.exists) return { status: 404, body: { error: 'Notebook nicht gefunden' } };
  if (!access.canRead) return { status: 403, body: { error: 'Keine Berechtigung' } };
  return null;
}

/**
 * Convenience guard for mutation endpoints. Returns a 403/404-shaped object
 * the caller can return directly when access is denied; otherwise null when
 * the user is allowed to proceed.
 */
export async function requireNotebookEdit(
  notebookId: string,
  userId: string | null
): Promise<{ status: 403 | 404; body: { error: string } } | null> {
  const access = await checkNotebookAccess(notebookId, userId);
  if (!access.exists) return { status: 404, body: { error: 'Notebook nicht gefunden' } };
  if (!access.canEdit) return { status: 403, body: { error: 'Keine Berechtigung' } };
  return null;
}

/**
 * Convenience guard for owner-only operations (delete, change visibility).
 */
export async function requireNotebookOwner(
  notebookId: string,
  userId: string | null
): Promise<{ status: 403 | 404; body: { error: string } } | null> {
  const access = await checkNotebookAccess(notebookId, userId);
  if (!access.exists) return { status: 404, body: { error: 'Notebook nicht gefunden' } };
  if (!access.isOwner) return { status: 403, body: { error: 'Nur Eigentümer*in erlaubt' } };
  return null;
}
