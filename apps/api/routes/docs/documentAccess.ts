import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';

import { GRANTED_BY_SHARE_LINK } from './constants.js';
import { type CollaborativeDocument } from './types.js';

const db = getPostgresInstance();

export interface AccessResult {
  hasAccess: boolean;
  accessMethod: string;
}

export function checkDirectAccess(document: CollaborativeDocument, userId: string): AccessResult {
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
    `SELECT gcs.permissions FROM group_content_shares gcs
     INNER JOIN group_memberships gm ON gm.group_id = gcs.group_id AND gm.user_id = $1
     WHERE gcs.content_type = 'collaborative_documents' AND gcs.content_id = $2 LIMIT 1`,
    [userId, documentId]
  )) as { permissions: { read: boolean; write: boolean } | null }[];

  if (groupAccess.length > 0 && groupAccess[0].permissions?.read !== false) {
    return { hasAccess: true, accessMethod: 'group:read' };
  }

  return { hasAccess: false, accessMethod: 'none' };
}

export async function checkDocumentAccess(
  document: CollaborativeDocument,
  userId: string
): Promise<AccessResult> {
  const direct = checkDirectAccess(document, userId);
  if (direct.hasAccess) return direct;

  return checkGroupAccess(userId, document.id);
}

export function autoGrantSharePermission(document: CollaborativeDocument, userId: string): void {
  if (
    document.share_mode !== 'authenticated' ||
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
