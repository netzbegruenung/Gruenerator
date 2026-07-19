/**
 * Canonical permission representation for `group_content_shares`.
 *
 * Two endpoints write this table: the document-centric `/api/docs/:id/groups`
 * (which speaks `permission_level: 'viewer' | 'editor'`) and the group-centric
 * `/api/auth/groups/:groupId/share` (which speaks `{ read, write, collaborative }`).
 * They previously persisted subtly different JSONB shapes (the docs path omitted
 * `collaborative`). This module is the single normaliser so both write an
 * identical row, and the read-back derives the level the same way.
 */

export interface GroupSharePermissions {
  read: boolean;
  write: boolean;
  collaborative: boolean;
}

/** `viewer | editor` → canonical permissions (editor ⇒ write). */
export function permissionLevelToShare(level: 'viewer' | 'editor'): GroupSharePermissions {
  return { read: true, write: level === 'editor', collaborative: false };
}

/** Fill defaults on a partial `{ read, write, collaborative }` (read defaults on). */
export function normalizeSharePermissions(
  p?: Partial<GroupSharePermissions> | null
): GroupSharePermissions {
  return {
    read: p?.read ?? true,
    write: p?.write ?? false,
    collaborative: p?.collaborative ?? false,
  };
}

/** Canonical permissions → the coarse `viewer | editor` level (write ⇒ editor). */
export function shareToPermissionLevel(
  p?: Partial<GroupSharePermissions> | null
): 'viewer' | 'editor' {
  return p?.write ? 'editor' : 'viewer';
}
