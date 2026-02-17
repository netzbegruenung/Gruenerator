import { Router, type Request, type Response } from 'express';

import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';

import { DOCS_SUBTYPES } from './constants.js';

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

const router = Router();
const db = getPostgresInstance();

/**
 * @route   GET /api/docs/:id/permissions
 * @desc    List all permissions for a document
 * @access  Private (document collaborators only)
 */
router.get('/:id/permissions', async (req: Request, res: Response) => {
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
      return res.status(403).json({ error: 'Access denied' });
    }

    const permissions = document.permissions || {};
    const userIds = Object.keys(permissions);

    if (userIds.length === 0) {
      return res.json([]);
    }

    const profilesResult = (await db.query(
      'SELECT id, display_name, email, avatar_url FROM profiles WHERE id = ANY($1)',
      [userIds]
    )) as ProfileRow[];

    const permissionsList = profilesResult.map((profile) => {
      const odId = profile.id;
      return {
        user_id: profile.id,
        display_name: profile.display_name,
        email: profile.email,
        avatar_url: profile.avatar_url,
        permission_level: permissions[odId].level,
        granted_at: permissions[odId].granted_at,
      };
    });

    return res.json(permissionsList);
  } catch (error: any) {
    console.error('[Docs] Error listing permissions:', error);
    return res.status(500).json({ error: 'Failed to list permissions', details: error.message });
  }
});

/**
 * @route   POST /api/docs/:id/permissions
 * @desc    Grant permission to a user
 * @access  Private (owner only)
 */
router.post('/:id/permissions', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { user_id, permission_level } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    if (!user_id || !permission_level) {
      return res.status(400).json({ error: 'user_id and permission_level are required' });
    }

    if (!['owner', 'editor', 'viewer'].includes(permission_level)) {
      return res
        .status(400)
        .json({ error: 'Invalid permission level. Must be owner, editor, or viewer' });
    }

    const docResult = (await db.query(
      'SELECT created_by, permissions FROM collaborative_documents WHERE id = $1 AND document_subtype = ANY($2::text[]) AND is_deleted = false',
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

    const userExists = (await db.query('SELECT id FROM profiles WHERE id = $1', [
      user_id,
    ])) as ProfileRow[];
    if (userExists.length === 0) {
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

    return res.json({
      message: 'Permission granted successfully',
      user_id,
      permission_level,
    });
  } catch (error: any) {
    console.error('[Docs] Error granting permission:', error);
    return res.status(500).json({ error: 'Failed to grant permission', details: error.message });
  }
});

/**
 * @route   PUT /api/docs/:id/permissions/:userId
 * @desc    Update a user's permission level
 * @access  Private (owner only)
 */
router.put('/:id/permissions/:targetUserId', async (req: Request, res: Response) => {
  try {
    const { id, targetUserId } = req.params;
    const { permission_level } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    if (!permission_level) {
      return res.status(400).json({ error: 'permission_level is required' });
    }

    if (!['owner', 'editor', 'viewer'].includes(permission_level)) {
      return res.status(400).json({ error: 'Invalid permission level' });
    }

    const docResult = (await db.query(
      'SELECT created_by, permissions FROM collaborative_documents WHERE id = $1 AND document_subtype = ANY($2::text[]) AND is_deleted = false',
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

    return res.json({
      message: 'Permission updated successfully',
      user_id: targetUserId,
      permission_level,
    });
  } catch (error: any) {
    console.error('[Docs] Error updating permission:', error);
    return res.status(500).json({ error: 'Failed to update permission', details: error.message });
  }
});

/**
 * @route   DELETE /api/docs/:id/permissions/:userId
 * @desc    Revoke a user's permission
 * @access  Private (owner only)
 */
router.delete('/:id/permissions/:targetUserId', async (req: Request, res: Response) => {
  try {
    const { id, targetUserId } = req.params;
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
    const userPermission = document.permissions?.[userId];
    const isOwner =
      document.created_by === userId || (userPermission && userPermission.level === 'owner');

    if (!isOwner) {
      return res.status(403).json({ error: 'Only owners can manage permissions' });
    }

    if (targetUserId === document.created_by) {
      return res.status(400).json({ error: 'Cannot revoke permissions from the document creator' });
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

    return res.json({ message: 'Permission revoked successfully' });
  } catch (error: any) {
    console.error('[Docs] Error revoking permission:', error);
    return res.status(500).json({ error: 'Failed to revoke permission', details: error.message });
  }
});

export default router;
