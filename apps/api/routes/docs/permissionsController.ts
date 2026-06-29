import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import { validateBody, type TypedRequest } from '../../middleware/validateBody.js';
import { getDocPreview } from '../../services/docs/docPreview.js';

import { DOCS_SUBTYPES } from './constants.js';

import type { UserProfile } from '../../services/user/types.js';

/**
 * Permission entry for a user on a document
 */
interface PermissionEntry {
  level: 'owner' | 'editor' | 'viewer';
  granted_at: string;
  granted_by?: string;
  updated_at?: string;
  updated_by?: string;
}

/**
 * Permissions object mapping user IDs to their permission entries
 */
interface DocumentPermissions {
  [userId: string]: PermissionEntry;
}

/**
 * Document row with permissions
 */
interface DocumentWithPermissions {
  id: string;
  created_by: string;
  permissions: DocumentPermissions | null;
  [key: string]: unknown;
}

/**
 * Profile row from database
 */
interface ProfileRow {
  id: string;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
  [key: string]: unknown;
}

// ============================================================================
// Zod Schemas
// ============================================================================

const grantPermissionSchema = z.object({
  user_id: z.string(),
  permission_level: z.enum(['owner', 'editor', 'viewer']),
});
type GrantPermissionBody = z.infer<typeof grantPermissionSchema>;

const updatePermissionSchema = z.object({
  permission_level: z.enum(['owner', 'editor', 'viewer']),
});
type UpdatePermissionBody = z.infer<typeof updatePermissionSchema>;

const router = Router();
const db = getPostgresInstance();

/**
 * @route   GET /api/docs/:id/permissions
 * @desc    List all permissions for a document
 * @access  Private (document collaborators only)
 */
router.get('/:id/permissions', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const docResult = (await db.query(
      'SELECT created_by, permissions FROM collaborative_documents WHERE id = $1 AND document_subtype = ANY($2::text[]) AND is_deleted = false',
      [id, DOCS_SUBTYPES]
    )) as DocumentWithPermissions[];

    if (docResult.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const document = docResult[0];

    const hasAccess =
      document.created_by === userId || (document.permissions && document.permissions[userId]);

    if (!hasAccess) {
      console.error(
        '[Docs] Permissions 403: created_by=%s, userId=%s, docId=%s, permKeys=%o',
        document.created_by,
        userId,
        id,
        Object.keys(document.permissions || {})
      );
      return res.status(403).json({ error: 'Access denied' });
    }

    const permissions = document.permissions || {};
    const userIds = Object.keys(permissions);

    if (userIds.length === 0) {
      return res.json([]);
    }

    const profilesResult = (await db.query(
      'SELECT id, display_name, email, avatar_url, avatar_robot_id FROM profiles WHERE id = ANY($1)',
      [userIds]
    )) as ProfileRow[];

    const permissionsList = profilesResult.map((profile) => {
      const odId = profile.id;
      return {
        type: 'user' as const,
        user_id: profile.id,
        display_name: profile.display_name,
        email: profile.email,
        avatar_url: profile.avatar_url,
        avatar_robot_id: profile.avatar_robot_id,
        permission_level: permissions[odId].level,
        granted_at: permissions[odId].granted_at,
      };
    });

    // Fetch groups shared with this document
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

    return res.json([...permissionsList, ...groupEntries]);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Docs] Error listing permissions:', error);
    return res.status(500).json({ error: 'Failed to list permissions', details: message });
  }
});

/**
 * @route   POST /api/docs/:id/permissions
 * @desc    Grant permission to a user
 * @access  Private (owner only)
 */
router.post(
  '/:id/permissions',
  validateBody(grantPermissionSchema),
  async (req: TypedRequest<GrantPermissionBody, { id: string }>, res: Response) => {
    try {
      const { id } = req.params;
      const { user_id, permission_level } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const docResult = (await db.query(
        'SELECT created_by, permissions, title FROM collaborative_documents WHERE id = $1 AND document_subtype = ANY($2::text[]) AND is_deleted = false',
        [id, DOCS_SUBTYPES]
      )) as DocumentWithPermissions[];

      if (docResult.length === 0) {
        return res.status(404).json({ error: 'Document not found' });
      }

      const document = docResult[0];
      const userPermission = document.permissions?.[userId];
      const isOwner =
        document.created_by === userId || (userPermission && userPermission.level === 'owner');

      if (!isOwner) {
        return res.status(403).json({ error: 'Only owners can manage permissions' });
      }

      const recipientProfile = (await db.query(
        'SELECT id, display_name, email, user_defaults FROM profiles WHERE id = $1',
        [user_id]
      )) as ProfileRow[];
      if (recipientProfile.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      const permissions: DocumentPermissions = document.permissions || {};
      permissions[user_id] = {
        level: permission_level,
        granted_at: new Date().toISOString(),
        granted_by: userId,
      };

      await db.query(
        'UPDATE collaborative_documents SET permissions = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [JSON.stringify(permissions), id]
      );

      // Fire-and-forget: send share notification email (respects recipient's preferences)
      const recipient = recipientProfile[0];
      if (recipient.email) {
        const senderProfile = (await db.query('SELECT display_name FROM profiles WHERE id = $1', [
          userId,
        ])) as ProfileRow[];
        const senderName = senderProfile[0]?.display_name || 'Jemand';

        const docTitle = (document.title as string) || 'Unbenanntes Dokument';

        // Fire-and-forget: in-app notification
        import('../../services/notifications/index.js')
          .then(({ createNotification }) =>
            createNotification({
              userId: user_id,
              type: 'document_shared',
              title: `${senderName} hat ein Dokument mit dir geteilt`,
              body: docTitle,
              metadata: { documentId: id, senderName, permissionLevel: permission_level },
              actionUrl: `/docs/${id}`,
              groupKey: `doc:${id}:shared`,
            })
          )
          .catch(() => {});

        // Fire-and-forget: email notification (respects recipient's preferences)
        import('../../services/email/index.js')
          .then(async ({ sendDocumentShareEmail, shouldSendNotification }) => {
            // Convert ProfileRow to UserProfile by casting
            const recipientProfile = recipient as unknown as UserProfile;
            const shouldSend = await shouldSendNotification(
              user_id,
              'document_shared',
              recipientProfile
            );
            if (!shouldSend) return;
            // Fetch the preview off the response path (only the email needs it).
            const docPreview = await getDocPreview(id);
            return sendDocumentShareEmail({
              recipientEmail: recipient.email!,
              recipientName: recipient.display_name || 'Kolleg*in',
              senderName,
              documentId: id,
              documentTitle: docTitle,
              permissionLevel: permission_level,
              documentPreview: docPreview?.snippet ?? null,
            });
          })
          .catch(() => {});
      }

      return res.json({
        message: 'Permission granted successfully',
        user_id,
        permission_level,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[Docs] Error granting permission:', error);
      return res.status(500).json({ error: 'Failed to grant permission', details: message });
    }
  }
);

/**
 * @route   PUT /api/docs/:id/permissions/:userId
 * @desc    Update a user's permission level
 * @access  Private (owner only)
 */
router.put(
  '/:id/permissions/:targetUserId',
  validateBody(updatePermissionSchema),
  async (
    req: TypedRequest<UpdatePermissionBody, { id: string; targetUserId: string }>,
    res: Response
  ) => {
    try {
      const { id, targetUserId } = req.params;
      const { permission_level } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const docResult = (await db.query(
        'SELECT created_by, permissions, title FROM collaborative_documents WHERE id = $1 AND document_subtype = ANY($2::text[]) AND is_deleted = false',
        [id, DOCS_SUBTYPES]
      )) as (DocumentWithPermissions & { title?: string })[];

      if (docResult.length === 0) {
        return res.status(404).json({ error: 'Document not found' });
      }

      const document = docResult[0];
      const userPermission = document.permissions?.[userId];
      const isOwner =
        document.created_by === userId || (userPermission && userPermission.level === 'owner');

      if (!isOwner) {
        return res.status(403).json({ error: 'Only owners can manage permissions' });
      }

      const permissions: DocumentPermissions = document.permissions || {};

      if (!permissions[targetUserId]) {
        return res.status(404).json({ error: 'User does not have access to this document' });
      }

      permissions[targetUserId] = {
        ...permissions[targetUserId],
        level: permission_level,
        updated_at: new Date().toISOString(),
        updated_by: userId,
      };

      await db.query(
        'UPDATE collaborative_documents SET permissions = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [JSON.stringify(permissions), id]
      );

      const LEVEL_LABELS: Record<string, string> = {
        owner: 'Eigentümer*in',
        editor: 'Bearbeiter*in',
        viewer: 'Leser*in',
        comment: 'Kommentator*in',
      };
      const permissionLabel = LEVEL_LABELS[permission_level] || permission_level;
      const docTitle = document.title || 'Dokument';
      // Fetch the preview inside the fire-and-forget block so the HTTP response
      // isn't blocked on a full content-column read it never uses.
      import('../../services/notifications/index.js')
        .then(async ({ createNotification }) => {
          const docPreview = await getDocPreview(id);
          return createNotification({
            userId: targetUserId,
            type: 'document_permission_changed',
            title: 'Berechtigung geändert',
            body: `Deine Berechtigung für „${docTitle}" ist jetzt ${permissionLabel}`,
            actionUrl: `/docs/${id}`,
            metadata: {
              documentId: id,
              permissionLevel: permission_level,
              docTitle,
              permissionLabel,
              ...(docPreview?.snippet ? { docPreview: docPreview.snippet } : {}),
            },
          });
        })
        .catch(() => {});

      return res.json({
        message: 'Permission updated successfully',
        user_id: targetUserId,
        permission_level,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[Docs] Error updating permission:', error);
      return res.status(500).json({ error: 'Failed to update permission', details: message });
    }
  }
);

/**
 * @route   DELETE /api/docs/:id/permissions/:userId
 * @desc    Revoke a user's permission
 * @access  Private (owner only)
 */
router.delete(
  '/:id/permissions/:targetUserId',
  async (req: Request<{ id: string; targetUserId: string }>, res: Response) => {
    try {
      const { id, targetUserId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const docResult = (await db.query(
        'SELECT created_by, permissions, title FROM collaborative_documents WHERE id = $1 AND document_subtype = ANY($2::text[]) AND is_deleted = false',
        [id, DOCS_SUBTYPES]
      )) as (DocumentWithPermissions & { title?: string })[];

      if (docResult.length === 0) {
        return res.status(404).json({ error: 'Document not found' });
      }

      const document = docResult[0];
      const userPermission = document.permissions?.[userId];
      const isOwner =
        document.created_by === userId || (userPermission && userPermission.level === 'owner');

      if (!isOwner) {
        return res.status(403).json({ error: 'Only owners can manage permissions' });
      }

      if (targetUserId === document.created_by) {
        return res
          .status(400)
          .json({ error: 'Cannot revoke permissions from the document creator' });
      }

      const permissions: DocumentPermissions = document.permissions || {};

      if (!permissions[targetUserId]) {
        return res.status(404).json({ error: 'User does not have access to this document' });
      }

      delete permissions[targetUserId];

      await db.query(
        'UPDATE collaborative_documents SET permissions = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [JSON.stringify(permissions), id]
      );

      import('../../services/notifications/index.js')
        .then(({ createNotification }) =>
          createNotification({
            userId: targetUserId,
            type: 'document_access_revoked',
            title: 'Zugriff entfernt',
            body: `Dein Zugriff auf „${document.title || 'Dokument'}" wurde entfernt`,
            // No actionUrl/preview: the link would 403 now that access is gone.
            metadata: { documentId: id, docTitle: document.title || 'Dokument' },
          })
        )
        .catch(() => {});

      return res.json({ message: 'Permission revoked successfully' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[Docs] Error revoking permission:', error);
      return res.status(500).json({ error: 'Failed to revoke permission', details: message });
    }
  }
);

export default router;
