import { Router, type Request, type Response } from 'express';

import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';

import { DOCS_SUBTYPES } from './constants.js';

interface DocumentRow {
  id: string;
  created_by: string;
  permissions: Record<string, { level?: string }> | null;
  is_public: boolean;
  share_permission: string;
  share_mode: 'private' | 'authenticated' | 'public';
  is_deleted: boolean;
}

const router = Router();
const db = getPostgresInstance();

function isOwner(doc: DocumentRow, userId: string): boolean {
  return doc.created_by === userId || doc.permissions?.[userId]?.level === 'owner';
}

async function getOwnedDocument(
  id: string,
  userId: string,
  res: Response
): Promise<DocumentRow | null> {
  const result = (await db.query(
    `SELECT id, created_by, permissions, is_public, share_permission, share_mode, is_deleted
     FROM collaborative_documents
     WHERE id = $1 AND document_subtype = ANY($2::text[]) AND is_deleted = false`,
    [id, DOCS_SUBTYPES]
  )) as unknown as DocumentRow[];

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
      share_mode: doc.share_mode || 'private',
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
       SET is_public = true, share_mode = 'public', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [req.params.id]
    );

    return res.json({
      is_public: true,
      share_permission: doc.share_permission || 'editor',
      share_mode: 'public' as const,
    });
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
       SET is_public = false, share_mode = 'private', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [req.params.id]
    );

    return res.json({
      is_public: false,
      share_permission: doc.share_permission || 'editor',
      share_mode: 'private' as const,
    });
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

    return res.json({
      is_public: doc.is_public,
      share_permission: permission,
      share_mode: doc.share_mode || 'private',
    });
  } catch (error: any) {
    console.error('[Docs] Error updating share permission:', error);
    return res.status(500).json({ error: 'Failed to update share permission' });
  }
});

/**
 * @route   PUT /api/docs/:id/share/mode
 * @desc    Set share mode (private, authenticated, public)
 * @access  Private (owner only)
 */
router.put('/:id/share/mode', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'User not authenticated' });

    const { mode } = req.body;
    if (!mode || !['private', 'authenticated', 'public'].includes(mode)) {
      return res
        .status(400)
        .json({ error: 'mode must be "private", "authenticated", or "public"' });
    }

    const doc = await getOwnedDocument(req.params.id, userId, res);
    if (!doc) return;

    const isPublic = mode === 'public';

    await db.query(
      `UPDATE collaborative_documents
       SET share_mode = $1, is_public = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [mode, isPublic, req.params.id]
    );

    return res.json({
      is_public: isPublic,
      share_permission: doc.share_permission || 'editor',
      share_mode: mode,
    });
  } catch (error: any) {
    console.error('[Docs] Error updating share mode:', error);
    return res.status(500).json({ error: 'Failed to update share mode' });
  }
});

export default router;
