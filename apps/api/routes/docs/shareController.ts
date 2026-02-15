import { Router, type Request, type Response } from 'express';
import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';

interface DocumentRow {
  id: string;
  created_by: string;
  permissions: Record<string, { level?: string }> | null;
  is_public: boolean;
  share_permission: string;
  is_deleted: boolean;
}

const router = Router();
const db = getPostgresInstance();

function isOwner(doc: DocumentRow, userId: string): boolean {
  return (
    doc.created_by === userId ||
    doc.permissions?.[userId]?.level === 'owner'
  );
}

async function getOwnedDocument(id: string, userId: string, res: Response): Promise<DocumentRow | null> {
  const result = await db.query(
    `SELECT id, created_by, permissions, is_public, share_permission, is_deleted
     FROM collaborative_documents
     WHERE id = $1 AND document_subtype = 'docs' AND is_deleted = false`,
    [id]
  ) as unknown as DocumentRow[];

  if (result.length === 0) {
    res.status(404).json({ error: 'Document not found' });
    return null;
  }

  if (!isOwner(result[0], userId)) {
    res.status(403).json({ error: 'Only owners can manage sharing settings' });
    return null;
  }

  return result[0];
}

/**
 * @route   GET /api/docs/:id/share
 * @desc    Get share settings for a document
 * @access  Private (owner only)
 */
router.get('/:id/share', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'User not authenticated' });

    const doc = await getOwnedDocument(req.params.id, userId, res);
    if (!doc) return;

    return res.json({
      is_public: doc.is_public,
      share_permission: doc.share_permission || 'editor',
    });
  } catch (error: any) {
    console.error('[Docs] Error fetching share settings:', error);
    return res.status(500).json({ error: 'Failed to fetch share settings' });
  }
});

/**
 * @route   POST /api/docs/:id/share/enable
 * @desc    Enable public sharing
 * @access  Private (owner only)
 */
router.post('/:id/share/enable', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'User not authenticated' });

    const doc = await getOwnedDocument(req.params.id, userId, res);
    if (!doc) return;

    await db.query(
      `UPDATE collaborative_documents
       SET is_public = true, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [req.params.id]
    );

    return res.json({ is_public: true, share_permission: doc.share_permission || 'editor' });
  } catch (error: any) {
    console.error('[Docs] Error enabling sharing:', error);
    return res.status(500).json({ error: 'Failed to enable sharing' });
  }
});

/**
 * @route   POST /api/docs/:id/share/disable
 * @desc    Disable public sharing
 * @access  Private (owner only)
 */
router.post('/:id/share/disable', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'User not authenticated' });

    const doc = await getOwnedDocument(req.params.id, userId, res);
    if (!doc) return;

    await db.query(
      `UPDATE collaborative_documents
       SET is_public = false, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [req.params.id]
    );

    return res.json({ is_public: false, share_permission: doc.share_permission || 'editor' });
  } catch (error: any) {
    console.error('[Docs] Error disabling sharing:', error);
    return res.status(500).json({ error: 'Failed to disable sharing' });
  }
});

/**
 * @route   PUT /api/docs/:id/share/permission
 * @desc    Update public share permission level
 * @access  Private (owner only)
 */
router.put('/:id/share/permission', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'User not authenticated' });

    const { permission } = req.body;
    if (!permission || !['viewer', 'editor'].includes(permission)) {
      return res.status(400).json({ error: 'permission must be "viewer" or "editor"' });
    }

    const doc = await getOwnedDocument(req.params.id, userId, res);
    if (!doc) return;

    await db.query(
      `UPDATE collaborative_documents
       SET share_permission = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [permission, req.params.id]
    );

    return res.json({ is_public: doc.is_public, share_permission: permission });
  } catch (error: any) {
    console.error('[Docs] Error updating share permission:', error);
    return res.status(500).json({ error: 'Failed to update share permission' });
  }
});

export default router;
