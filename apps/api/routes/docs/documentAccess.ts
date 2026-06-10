import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';

import { GRANTED_BY_SHARE_LINK } from './constants.js';
import { type CollaborativeDocument } from './types.js';

const db = getPostgresInstance();

export interface AccessResult {
  hasAccess: boolean;
  accessMethod: string;
}

export type DocumentAccessSubject = Pick<
  CollaborativeDocument,
  'id' | 'created_by' | 'permissions' | 'is_public' | 'share_mode'
>;

export function checkDirectAccess(document: DocumentAccessSubject, userId: string): AccessResult {
  const isOwner = document.created_by === userId;
  if (isOwner) return { hasAccess: true, accessMethod: 'owner' };

  if (document.is_public) return { hasAccess: true, accessMethod: 'public' };

  if (document.share_mode === 'authenticated') {
    return { hasAccess: true, accessMethod: 'authenticated' };
  }

  const hasDirectPerm = !!(document.permissions && document.permissions[userId]);
  if (hasDirectPerm) {
    return { hasAccess: true, accessMethod: `direct:${document.permissions?.[userId]?.level}` };
  }

  return { hasAccess: false, accessMethod: 'none' };
}

export async function checkGroupAccess(userId: string, documentId: string): Promise<AccessResult> {
  const groupAccess = (await db.query(
    `SELECT gcs.content_type, gcs.permissions FROM group_content_shares gcs
     INNER JOIN group_memberships gm ON gm.group_id = gcs.group_id AND gm.user_id = $1 AND gm.is_active = TRUE
     WHERE gcs.content_type IN ('collaborative_documents', 'canvas_template')
       AND gcs.content_id = $2
     LIMIT 1`,
    [userId, documentId]
  )) as { content_type: string; permissions: { read: boolean; write: boolean } | null }[];

  if (groupAccess.length > 0 && groupAccess[0].permissions?.read !== false) {
    const method =
      groupAccess[0].content_type === 'canvas_template' ? 'group:template' : 'group:read';
    return { hasAccess: true, accessMethod: method };
  }

  return { hasAccess: false, accessMethod: 'none' };
}

export async function checkDocumentAccess(
  document: DocumentAccessSubject,
  userId: string
): Promise<AccessResult> {
  const direct = checkDirectAccess(document, userId);
  if (direct.hasAccess) return direct;

  return checkGroupAccess(userId, document.id);
}

/**
 * Write-access mirror of the Hocuspocus connection check
 * (services/hocuspocus/src/auth.ts `canEditDocument`): owner → direct
 * owner/editor permission → editor share link → group share with write.
 */
export async function checkDocumentWriteAccess(
  documentId: string,
  userId: string
): Promise<boolean> {
  const rows = (await db.query(
    `SELECT created_by, permissions, is_public, share_mode, share_permission
     FROM collaborative_documents
     WHERE id = $1 AND is_deleted = false`,
    [documentId]
  )) as {
    created_by: string;
    permissions: Record<string, { level?: string } | undefined> | null;
    is_public: boolean;
    share_mode: string | null;
    share_permission: string | null;
  }[];

  if (rows.length === 0) return false;
  const doc = rows[0];

  if (doc.created_by === userId) return true;

  const level = doc.permissions?.[userId]?.level;
  if (level === 'owner' || level === 'editor') return true;

  const sharePermission = doc.share_permission || 'editor';
  if ((doc.share_mode === 'authenticated' || doc.is_public) && sharePermission === 'editor') {
    return true;
  }

  const groupAccess = (await db.query(
    `SELECT gcs.permissions FROM group_content_shares gcs
     INNER JOIN group_memberships gm ON gm.group_id = gcs.group_id AND gm.user_id = $1 AND gm.is_active = TRUE
     WHERE gcs.content_type = 'collaborative_documents' AND gcs.content_id = $2
     LIMIT 1`,
    [userId, documentId]
  )) as { permissions: { read?: boolean; write?: boolean } | null }[];

  return groupAccess.length > 0 && groupAccess[0].permissions?.write === true;
}

export function autoGrantSharePermission(document: CollaborativeDocument, userId: string): void {
  const isLinkShared = document.share_mode === 'authenticated' || document.share_mode === 'public';
  if (
    !isLinkShared ||
    document.created_by === userId ||
    (document.permissions && document.permissions[userId])
  ) {
    return;
  }

  const permissionLevel = document.share_permission || 'editor';
  const permissionEntry = JSON.stringify({
    [userId]: {
      level: permissionLevel,
      granted_at: new Date().toISOString(),
      granted_by: GRANTED_BY_SHARE_LINK,
    },
  });

  db.query(
    `UPDATE collaborative_documents
     SET permissions = COALESCE(permissions, '{}')::jsonb || $1::jsonb,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $2
       AND NOT (COALESCE(permissions, '{}')::jsonb ? $3)`,
    [permissionEntry, document.id, userId]
  ).catch((err: unknown) => {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[Docs] Error auto-adding user to permissions:', errMsg);
  });
}
