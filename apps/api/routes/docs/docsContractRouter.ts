/**
 * ts-rest contract router for /api/docs (collaborative documents, permissions, sharing, group shares).
 *
 * Wraps the same DB queries and access checks as the legacy controllers in
 * documentController.ts, permissionsController.ts, shareController.ts, and
 * groupShareController.ts using a contract-driven router from @ts-rest/express.
 *
 * Mount BEFORE the legacy docsRouter in routes.ts so ts-rest matches its own
 * routes first; unmatched paths fall through to the legacy router.
 *
 * ## Authentication
 * All routes require authentication. `requireAuth` middleware is applied at
 * the path prefix in routes.ts before this contract is mounted, so
 * `req.user` is always present. `getUserId()` throws when it is not (safety
 * guard only — should never fire in production).
 */

import { docsContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { createLogger } from '../../utils/logger.js';

import { DOCS_SUBTYPES, GRANTED_BY_SHARE_LINK } from './constants.js';
import { checkDocumentAccess, autoGrantSharePermission } from './documentAccess.js';

import type { CollaborativeDocument } from './types.js';
import type { UserProfile } from '../../services/user/types.js';
import type { Application, Request } from 'express';

const log = createLogger('docsContractRouter');
const db = getPostgresInstance();

/**
 * Extract the authenticated user id.
 * The requireAuth middleware in routes.ts ensures req.user is set before
 * this router is reached — this function is a safety guard only.
 */
function getUserId(req: Request): string {
  const user = req.user as UserProfile | undefined;
  if (!user?.id) {
    log.error(
      '[docsContract] getUserId called with undefined req.user — middleware bypassed? url=%s',
      req.originalUrl
    );
    throw new Error('Authentication required');
  }
  return user.id;
}

// ── Contract router ────────────────────────────────────────────────────────

const s = initServer();

export const docsContractRouter = s.router(docsContract, {
  getDocumentById: async (args) => {
    try {
      const userId = getUserId(args.req);
      const { id } = args.params;

      const result = (await db.query(
        `SELECT
          cd.*,
          p.display_name as creator_name,
          le.display_name as last_editor_name
         FROM collaborative_documents cd
         LEFT JOIN profiles p ON cd.created_by = p.id
         LEFT JOIN profiles le ON cd.last_edited_by = le.id
         WHERE
          cd.id = $1
          AND cd.document_subtype = ANY($2::text[])
          AND cd.is_deleted = false`,
        [id, DOCS_SUBTYPES]
      )) as CollaborativeDocument[];

      if (result.length === 0) {
        return { status: 404 as const, body: { error: 'Document not found' } };
      }

      const document = result[0];
      const { hasAccess } = await checkDocumentAccess(document, userId);

      if (!hasAccess) {
        return { status: 403 as const, body: { error: 'Access denied' } };
      }

      autoGrantSharePermission(document, userId);

      return { status: 200 as const, body: document };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error('[docsContract.getDocumentById] Error:', error);
      return {
        status: 500 as const,
        body: { error: 'Failed to fetch document', details: message },
      };
    }
  },

  listPermissions: async (args) => {
    try {
      const userId = getUserId(args.req);
      const { id } = args.params;

      interface DocumentWithPermissions {
        id: string;
        created_by: string;
        permissions: Record<string, { level: string; granted_at: string }> | null;
        [key: string]: unknown;
      }
      interface ProfileRow {
        id: string;
        display_name: string | null;
        email: string | null;
        avatar_url: string | null;
        avatar_robot_id: string | null;
        [key: string]: unknown;
      }

      const docResult = (await db.query(
        'SELECT created_by, permissions FROM collaborative_documents WHERE id = $1 AND document_subtype = ANY($2::text[]) AND is_deleted = false',
        [id, DOCS_SUBTYPES]
      )) as DocumentWithPermissions[];

      if (docResult.length === 0) {
        return { status: 404 as const, body: { error: 'Document not found' } };
      }

      const document = docResult[0];
      const hasAccess =
        document.created_by === userId || (document.permissions && document.permissions[userId]);

      if (!hasAccess) {
        return { status: 403 as const, body: { error: 'Access denied' } };
      }

      const permissions = document.permissions || {};
      const userIds = Object.keys(permissions);

      if (userIds.length === 0) {
        return { status: 200 as const, body: [] };
      }

      const profilesResult = (await db.query(
        'SELECT id, display_name, email, avatar_url, avatar_robot_id FROM profiles WHERE id = ANY($1)',
        [userIds]
      )) as ProfileRow[];

      const permissionsList = profilesResult.map((profile) => ({
        type: 'user' as const,
        user_id: profile.id,
        display_name: profile.display_name,
        email: profile.email,
        avatar_url: profile.avatar_url,
        avatar_robot_id: profile.avatar_robot_id,
        permission_level: permissions[profile.id].level,
        granted_at: permissions[profile.id].granted_at,
      }));

      const groupShares = (await db.query(
        `SELECT gcs.group_id, g.name AS group_name,
                gcs.permissions, gcs.shared_at,
                (SELECT COUNT(*)::int FROM group_memberships WHERE group_id = gcs.group_id) AS member_count
         FROM group_content_shares gcs
         JOIN groups g ON g.id = gcs.group_id
         WHERE gcs.content_type = 'collaborative_documents' AND gcs.content_id = $1`,
        [id]
      )) as Array<{
        group_id: string;
        group_name: string;
        permissions: { read?: boolean; write?: boolean };
        shared_at: string;
        member_count: number;
      }>;

      const groupEntries = groupShares.map((gs) => ({
        type: 'group' as const,
        group_id: gs.group_id,
        group_name: gs.group_name,
        permission_level: gs.permissions?.write ? 'editor' : 'viewer',
        shared_at: gs.shared_at,
        member_count: gs.member_count,
      }));

      return { status: 200 as const, body: [...permissionsList, ...groupEntries] };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error('[docsContract.listPermissions] Error:', error);
      return {
        status: 500 as const,
        body: { error: 'Failed to list permissions', details: message },
      };
    }
  },

  disableSharing: async (args) => {
    try {
      const userId = getUserId(args.req);
      const { id } = args.params;

      interface ShareDocRow {
        id: string;
        created_by: string;
        permissions: Record<string, { level?: string }> | null;
        is_public: boolean;
        share_permission?: string | null;
        share_mode?: string | null;
      }

      const result = (await db.query(
        `SELECT id, created_by, permissions, is_public, share_permission, share_mode
         FROM collaborative_documents
         WHERE id = $1 AND document_subtype = ANY($2::text[]) AND is_deleted = false`,
        [id, DOCS_SUBTYPES]
      )) as ShareDocRow[];

      if (result.length === 0) {
        return { status: 404 as const, body: { error: 'Document not found' } };
      }

      const doc = result[0];
      const perms = doc.permissions;
      const isOwner = doc.created_by === userId || perms?.[userId]?.level === 'owner';

      if (!isOwner) {
        return { status: 403 as const, body: { error: 'Only owners can manage sharing settings' } };
      }

      await db.query(
        `UPDATE collaborative_documents
         SET is_public = false,
             share_mode = 'private',
             permissions = (
               SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb)
               FROM jsonb_each(COALESCE(permissions, '{}'::jsonb))
               WHERE value->>'granted_by' IS DISTINCT FROM $2
             ),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [id, GRANTED_BY_SHARE_LINK]
      );

      return {
        status: 200 as const,
        body: {
          is_public: false,
          share_permission: doc.share_permission ?? 'editor',
          share_mode: 'private',
        },
      };
    } catch (error) {
      log.error('[docsContract.disableSharing] Error:', error);
      return { status: 500 as const, body: { error: 'Failed to disable sharing' } };
    }
  },

  addGroupShare: async (args) => {
    try {
      const userId = getUserId(args.req);
      const { id } = args.params;
      const { group_id, permission_level } = args.body;
      const effectiveLevel = permission_level ?? 'viewer';

      const doc = (await db.query(
        'SELECT created_by, title FROM collaborative_documents WHERE id = $1 AND is_deleted = false',
        [id]
      )) as { created_by: string; title?: string }[];

      if (doc.length === 0) {
        return { status: 404 as const, body: { error: 'Document not found' } };
      }

      if (doc[0].created_by !== userId) {
        return {
          status: 403 as const,
          body: { error: 'Only document owner can share with groups' },
        };
      }

      const membership = (await db.query(
        'SELECT user_id FROM group_memberships WHERE group_id = $1 AND user_id = $2',
        [group_id, userId]
      )) as { user_id: string }[];

      if (membership.length === 0) {
        return {
          status: 403 as const,
          body: { error: 'You must be a member of the group to share with it' },
        };
      }

      const existing = (await db.query(
        `SELECT id FROM group_content_shares
         WHERE content_type = 'collaborative_documents' AND content_id = $1 AND group_id = $2`,
        [id, group_id]
      )) as { id: string }[];

      if (existing.length > 0) {
        return {
          status: 409 as const,
          body: { error: 'Document is already shared with this group' },
        };
      }

      const permissions = { read: true, write: effectiveLevel === 'editor' };

      await db.query(
        `INSERT INTO group_content_shares (content_type, content_id, group_id, shared_by_user_id, permissions)
         VALUES ('collaborative_documents', $1, $2, $3, $4)`,
        [id, group_id, userId, JSON.stringify(permissions)]
      );

      // Fire-and-forget: notify group members
      import('../../services/notifications/index.js')
        .then(({ notifyGroupMembers }) =>
          notifyGroupMembers({
            groupId: group_id,
            excludeUserId: userId,
            type: 'group_content_shared',
            title: 'Dokument geteilt',
            body: `${(args.req.user as UserProfile | undefined)?.display_name || 'Jemand'} hat „${doc[0].title || 'ein Dokument'}" geteilt`,
            actionUrl: `/docs/${id}`,
            metadata: { documentId: id, groupId: group_id },
          })
        )
        .catch(() => {});

      return { status: 201 as const, body: { message: 'Document shared with group successfully' } };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error('[docsContract.addGroupShare] Error:', error);
      return {
        status: 500 as const,
        body: { error: 'Failed to share document with group', details: message },
      };
    }
  },

  updateGroupShare: async (args) => {
    try {
      const userId = getUserId(args.req);
      const { id, groupId } = args.params;
      const { permission_level } = args.body;

      const doc = (await db.query(
        'SELECT created_by FROM collaborative_documents WHERE id = $1 AND is_deleted = false',
        [id]
      )) as { created_by: string }[];

      if (doc.length === 0) {
        return { status: 404 as const, body: { error: 'Document not found' } };
      }

      if (doc[0].created_by !== userId) {
        return {
          status: 403 as const,
          body: { error: 'Only document owner can update group permissions' },
        };
      }

      const permissions = { read: true, write: permission_level === 'editor' };

      const result = await db.query(
        `UPDATE group_content_shares
         SET permissions = $1
         WHERE content_type = 'collaborative_documents' AND content_id = $2 AND group_id = $3
         RETURNING id`,
        [JSON.stringify(permissions), id, groupId]
      );

      if (!result || (result as unknown[]).length === 0) {
        return { status: 404 as const, body: { error: 'Group share not found' } };
      }

      return { status: 200 as const, body: { message: 'Group permission updated successfully' } };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error('[docsContract.updateGroupShare] Error:', error);
      return {
        status: 500 as const,
        body: { error: 'Failed to update group permission', details: message },
      };
    }
  },
});

/**
 * Mount the ts-rest docs contract router onto an Express app.
 * Call this from routes.ts BEFORE mounting the legacy docsRouter.
 *
 * `requireAuth` middleware MUST be applied at the /api/docs path prefix in
 * routes.ts before calling this function — all 5 routes require authentication.
 */
export function mountDocsContractRouter(app: Application): void {
  createExpressEndpoints(docsContract, docsContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'docsContract'),
  });
}
