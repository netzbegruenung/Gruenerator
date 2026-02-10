import { PostgresPersistence } from '@gruenerator/hocuspocus';
import { Router, type Request, type Response } from 'express';

import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';

/**
 * Permission entry for a user on a document
 */
interface PermissionEntry {
  level: 'owner' | 'editor' | 'viewer';
  granted_at: string;
  granted_by?: string;
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
 * Version row from yjs_document_snapshots
 */
interface VersionRow {
  id: string;
  version: number;
  label: string | null;
  is_auto_save: boolean;
  created_at: string;
  created_by: string;
  created_by_name?: string;
  [key: string]: unknown;
}

const router = Router();
const db = getPostgresInstance();
const persistence = new PostgresPersistence((sql, params) => db.query(sql, params));

/**
 * @route   GET /api/docs/:id/versions
 * @desc    List all versions for a document
 * @access  Private
 */
router.get('/:id/versions', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Check document access
    const docResult = (await db.query(
      'SELECT created_by, permissions FROM collaborative_documents WHERE id = $1 AND document_subtype = $2 AND is_deleted = false',
      [id, 'docs']
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

    // Get all versions
    const versions = (await db.query(
      `SELECT
        v.id,
        v.version,
        v.label,
        v.is_auto_save,
        v.created_at,
        v.created_by,
        p.display_name as created_by_name
       FROM yjs_document_snapshots v
       LEFT JOIN profiles p ON v.created_by = p.id
       WHERE v.document_id = $1
       ORDER BY v.version DESC`,
      [id]
    )) as VersionRow[];

    return res.json(versions);
  } catch (error: any) {
    console.error('[Versions] Error listing versions:', error);
    return res.status(500).json({ error: 'Failed to list versions', details: error.message });
  }
});

/**
 * @route   POST /api/docs/:id/versions
 * @desc    Create a manual snapshot/version
 * @access  Private
 */
router.post('/:id/versions', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { label } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Check document access and permissions
    const docResult = (await db.query(
      'SELECT created_by, permissions FROM collaborative_documents WHERE id = $1 AND document_subtype = $2 AND is_deleted = false',
      [id, 'docs']
    )) as DocumentWithPermissions[];

    if (docResult.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const document = docResult[0];
    const userPermission = document.permissions?.[userId];
    const isOwner = document.created_by === userId;
    const canEdit =
      isOwner || (userPermission && ['owner', 'editor'].includes(userPermission.level));

    if (!canEdit) {
      return res.status(403).json({ error: 'Insufficient permissions to create version' });
    }

    // Load current document state
    const currentState = await persistence.loadDocument(id);

    if (!currentState) {
      return res.status(404).json({ error: 'Document content not found' });
    }

    // Create manual snapshot
    const versionNumber = await persistence.createManualSnapshot(id, currentState, userId, label);

    return res.status(201).json({
      message: 'Version created successfully',
      version: versionNumber,
      label,
    });
  } catch (error: any) {
    console.error('[Versions] Error creating version:', error);
    return res.status(500).json({ error: 'Failed to create version', details: error.message });
  }
});

/**
 * @route   POST /api/docs/:id/versions/:versionNumber/restore
 * @desc    Restore document to a specific version
 * @access  Private (owner/editor only)
 */
router.post('/:id/versions/:versionNumber/restore', async (req: Request, res: Response) => {
  try {
    const { id, versionNumber } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Check document access and permissions
    const docResult = (await db.query(
      'SELECT created_by, permissions FROM collaborative_documents WHERE id = $1 AND document_subtype = $2 AND is_deleted = false',
      [id, 'docs']
    )) as DocumentWithPermissions[];

    if (docResult.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const document = docResult[0];
    const userPermission = document.permissions?.[userId];
    const isOwner = document.created_by === userId;
    const canEdit =
      isOwner || (userPermission && ['owner', 'editor'].includes(userPermission.level));

    if (!canEdit) {
      return res.status(403).json({ error: 'Insufficient permissions to restore version' });
    }

    // Get the version snapshot
    const versionData = await persistence.getDocumentAtVersion(id, parseInt(versionNumber, 10));

    if (!versionData) {
      return res.status(404).json({ error: 'Version not found' });
    }

    // Create a backup of current state before restoring
    const currentState = await persistence.loadDocument(id);
    if (currentState) {
      await persistence.createManualSnapshot(
        id,
        currentState,
        userId,
        `Backup before restoring to version ${versionNumber}`
      );
    }

    // Store the restored version as the current state
    await persistence.storeDocument(id, versionData);

    return res.json({
      message: 'Document restored successfully',
      restoredToVersion: parseInt(versionNumber, 10),
    });
  } catch (error: any) {
    console.error('[Versions] Error restoring version:', error);
    return res.status(500).json({ error: 'Failed to restore version', details: error.message });
  }
});

/**
 * @route   DELETE /api/docs/:id/versions/:versionNumber
 * @desc    Delete a specific version
 * @access  Private (owner only)
 */
router.delete('/:id/versions/:versionNumber', async (req: Request, res: Response) => {
  try {
    const { id, versionNumber } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Check document ownership
    const docResult = (await db.query(
      'SELECT created_by, permissions FROM collaborative_documents WHERE id = $1 AND document_subtype = $2 AND is_deleted = false',
      [id, 'docs']
    )) as DocumentWithPermissions[];

    if (docResult.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const document = docResult[0];
    const userPermission = document.permissions?.[userId];
    const isOwner =
      document.created_by === userId || (userPermission && userPermission.level === 'owner');

    if (!isOwner) {
      return res.status(403).json({ error: 'Only owners can delete versions' });
    }

    // Delete the version
    const result = (await db.query(
      'DELETE FROM yjs_document_snapshots WHERE document_id = $1 AND version = $2 RETURNING id',
      [id, parseInt(versionNumber, 10)]
    )) as Array<{ id: string }>;

    if (result.length === 0) {
      return res.status(404).json({ error: 'Version not found' });
    }

    return res.json({ message: 'Version deleted successfully' });
  } catch (error: any) {
    console.error('[Versions] Error deleting version:', error);
    return res.status(500).json({ error: 'Failed to delete version', details: error.message });
  }
});

export default router;
