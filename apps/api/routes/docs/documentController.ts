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
 * Collaborative document row from database
 */
interface CollaborativeDocument {
  id: string;
  title: string;
  content?: string;
  created_by: string;
  last_edited_by: string;
  document_subtype: string;
  folder_id: string | null;
  permissions: DocumentPermissions | null;
  is_public: boolean;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  creator_name?: string;
  last_editor_name?: string;
  [key: string]: unknown;
}

const router = Router();
const db = getPostgresInstance();

const DOCS_SUBTYPES = [
  'blank',
  'antrag',
  'pressemitteilung',
  'protokoll',
  'notizen',
  'redaktionsplan',
];

/**
 * @route   POST /api/docs
 * @desc    Create a new collaborative document
 * @access  Private
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { title = 'Untitled Document', folder_id = null, document_subtype = 'blank' } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const subtype = DOCS_SUBTYPES.includes(document_subtype) ? document_subtype : 'blank';

    const result = (await db.query(
      `INSERT INTO collaborative_documents
        (title, created_by, last_edited_by, document_subtype, folder_id, permissions, is_public)
       VALUES ($1, $2, $2, $3, $4, $5, false)
       RETURNING *`,
      [
        title,
        userId,
        subtype,
        folder_id,
        JSON.stringify({ [userId]: { level: 'owner', granted_at: new Date().toISOString() } }),
      ]
    )) as CollaborativeDocument[];

    return res.status(201).json(result[0]);
  } catch (error: any) {
    console.error('[Docs] Error creating document:', error);
    return res.status(500).json({ error: 'Failed to create document', details: error.message });
  }
});

/**
 * @route   GET /api/docs
 * @desc    List all documents user has access to
 * @access  Private
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const result = (await db.query(
      `SELECT
        cd.*,
        p.display_name as creator_name,
        le.display_name as last_editor_name
       FROM collaborative_documents cd
       LEFT JOIN profiles p ON cd.created_by = p.id
       LEFT JOIN profiles le ON cd.last_edited_by = le.id
       WHERE
        cd.document_subtype = ANY($2::text[])
        AND cd.is_deleted = false
        AND (
          cd.created_by = $1
          OR cd.permissions ? $1::text
          OR cd.is_public = true
        )
       ORDER BY cd.updated_at DESC`,
      [userId, DOCS_SUBTYPES]
    )) as CollaborativeDocument[];

    return res.json(result);
  } catch (error: any) {
    console.error('[Docs] Error listing documents:', error);
    return res.status(500).json({ error: 'Failed to list documents', details: error.message });
  }
});

/**
 * @route   GET /api/docs/:id
 * @desc    Get a specific document's metadata
 * @access  Private
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

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
      return res.status(404).json({ error: 'Document not found' });
    }

    const document = result[0];

    const hasAccess =
      document.created_by === userId ||
      document.is_public ||
      (document.permissions && document.permissions[userId]);

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    return res.json(document);
  } catch (error: any) {
    console.error('[Docs] Error fetching document:', error);
    return res.status(500).json({ error: 'Failed to fetch document', details: error.message });
  }
});

/**
 * @route   PUT /api/docs/:id
 * @desc    Update document metadata (title, folder)
 * @access  Private
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { title, folder_id, content } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const checkResult = (await db.query(
      'SELECT permissions, created_by FROM collaborative_documents WHERE id = $1 AND document_subtype = ANY($2::text[]) AND is_deleted = false',
      [id, DOCS_SUBTYPES]
    )) as CollaborativeDocument[];

    if (checkResult.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const document = checkResult[0];
    const userPermission = document.permissions?.[userId];
    const isOwner = document.created_by === userId;
    const canEdit =
      isOwner || (userPermission && ['owner', 'editor'].includes(userPermission.level));

    if (!canEdit) {
      return res.status(403).json({ error: 'Insufficient permissions to edit document' });
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (title !== undefined) {
      updates.push(`title = $${paramIndex++}`);
      values.push(title);
    }

    if (folder_id !== undefined) {
      updates.push(`folder_id = $${paramIndex++}`);
      values.push(folder_id);
    }

    if (content !== undefined) {
      updates.push(`content = $${paramIndex++}`);
      values.push(content);
    }

    updates.push(`last_edited_by = $${paramIndex++}`);
    values.push(userId);
    updates.push(`last_edited_at = CURRENT_TIMESTAMP`);

    values.push(id);

    const result = (await db.query(
      `UPDATE collaborative_documents
       SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    )) as CollaborativeDocument[];

    return res.json(result[0]);
  } catch (error: any) {
    console.error('[Docs] Error updating document:', error);
    return res.status(500).json({ error: 'Failed to update document', details: error.message });
  }
});

/**
 * @route   DELETE /api/docs/:id
 * @desc    Soft delete a document
 * @access  Private (Owner only)
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const checkResult = (await db.query(
      'SELECT created_by, permissions FROM collaborative_documents WHERE id = $1 AND document_subtype = ANY($2::text[]) AND is_deleted = false',
      [id, DOCS_SUBTYPES]
    )) as CollaborativeDocument[];

    if (checkResult.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const document = checkResult[0];
    const userPermission = document.permissions?.[userId];
    const isOwner =
      document.created_by === userId || (userPermission && userPermission.level === 'owner');

    if (!isOwner) {
      return res.status(403).json({ error: 'Only owners can delete documents' });
    }

    await db.query(
      'UPDATE collaborative_documents SET is_deleted = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [id]
    );

    return res.json({ message: 'Document deleted successfully' });
  } catch (error: any) {
    console.error('[Docs] Error deleting document:', error);
    return res.status(500).json({ error: 'Failed to delete document', details: error.message });
  }
});

/**
 * @route   POST /api/docs/:id/duplicate
 * @desc    Duplicate a document
 * @access  Private
 */
router.post('/:id/duplicate', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const checkResult = (await db.query(
      'SELECT * FROM collaborative_documents WHERE id = $1 AND document_subtype = ANY($2::text[]) AND is_deleted = false',
      [id, DOCS_SUBTYPES]
    )) as CollaborativeDocument[];

    if (checkResult.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const original = checkResult[0];

    const hasAccess =
      original.created_by === userId ||
      original.is_public ||
      (original.permissions && original.permissions[userId]);

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const newTitle = `${original.title} (Copy)`;
    const newDoc = (await db.query(
      `INSERT INTO collaborative_documents
        (title, created_by, last_edited_by, document_subtype, permissions, is_public, content)
       VALUES ($1, $2, $2, $3, $4, false, $5)
       RETURNING *`,
      [
        newTitle,
        userId,
        original.document_subtype,
        JSON.stringify({ [userId]: { level: 'owner', granted_at: new Date().toISOString() } }),
        original.content || '',
      ]
    )) as CollaborativeDocument[];

    return res.status(201).json(newDoc[0]);
  } catch (error: any) {
    console.error('[Docs] Error duplicating document:', error);
    return res.status(500).json({ error: 'Failed to duplicate document', details: error.message });
  }
});

export default router;
