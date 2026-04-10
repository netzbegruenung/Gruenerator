import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import { type CollaborativeDocumentRow } from '../../database/types.js';
import { validateBody, type TypedRequest } from '../../middleware/validateBody.js';

import { DOCS_SUBTYPES, GRANTED_BY_SHARE_LINK } from './constants.js';

const permissionSchema = z.object({
  permission: z.enum(['viewer', 'editor']),
});

const shareModeSchema = z.object({
  mode: z.enum(['private', 'authenticated', 'public']),
});

type ShareDocumentRow = Pick<
  CollaborativeDocumentRow,
  'id' | 'created_by' | 'permissions' | 'is_public'
> & {
  share_permission?: string;
  share_mode?: string;
  is_deleted?: boolean;
};

const router = Router();
const db = getPostgresInstance();

function isOwner(doc: ShareDocumentRow, userId: string): boolean {
  const perms = doc.permissions as Record<string, { level?: string }> | undefined;
  return doc.created_by === userId || perms?.[userId]?.level === 'owner';
}

async function getOwnedDocument(
  id: string,
  userId: string,
  res: Response
): Promise<ShareDocumentRow | null> {
  const result = await db.query<ShareDocumentRow>(
    `SELECT id, created_by, permissions, is_public, share_permission, share_mode, is_deleted
     FROM collaborative_documents
     WHERE id = $1 AND document_subtype = ANY($2::text[]) AND is_deleted = false`,
    [id, DOCS_SUBTYPES]
  );

  if (result.length === 0) {
    res.status(404).json({ error: 'Document not found' });
    return null;
  }

  if (!isOwner(result[0], userId)) {
    console.error(
      '[Docs] Share 403: created_by=%s, userId=%s, docId=%s, permKeys=%o',
      result[0].created_by,
      userId,
      id,
      Object.keys(result[0].permissions || {})
    );
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
router.get('/:id/share', async (req: Request<{ id: string }>, res: Response) => {
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
  } catch (error: unknown) {
    console.error('[Docs] Error fetching share settings:', error);
    return res.status(500).json({ error: 'Failed to fetch share settings' });
  }
});

/**
 * @route   POST /api/docs/:id/share/enable
 * @desc    Enable public sharing
 * @access  Private (owner only)
 */
router.post('/:id/share/enable', async (req: Request<{ id: string }>, res: Response) => {
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
  } catch (error: unknown) {
    console.error('[Docs] Error enabling sharing:', error);
    return res.status(500).json({ error: 'Failed to enable sharing' });
  }
});

/**
 * @route   POST /api/docs/:id/share/disable
 * @desc    Disable public sharing
 * @access  Private (owner only)
 */
router.post('/:id/share/disable', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'User not authenticated' });

    const doc = await getOwnedDocument(req.params.id, userId, res);
    if (!doc) return;

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
      [req.params.id, GRANTED_BY_SHARE_LINK]
    );

    return res.json({
      is_public: false,
      share_permission: doc.share_permission || 'editor',
      share_mode: 'private' as const,
    });
  } catch (error: unknown) {
    console.error('[Docs] Error disabling sharing:', error);
    return res.status(500).json({ error: 'Failed to disable sharing' });
  }
});

/**
 * @route   PUT /api/docs/:id/share/permission
 * @desc    Update public share permission level
 * @access  Private (owner only)
 */
router.put('/:id/share/permission', validateBody(permissionSchema), async (req: TypedRequest<{ permission: 'viewer' | 'editor' }, { id: string }>, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'User not authenticated' });

    const { permission } = req.body;

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
  } catch (error: unknown) {
    console.error('[Docs] Error updating share permission:', error);
    return res.status(500).json({ error: 'Failed to update share permission' });
  }
});

/**
 * @route   PUT /api/docs/:id/share/mode
 * @desc    Set share mode (private, authenticated, public)
 * @access  Private (owner only)
 */
router.put('/:id/share/mode', validateBody(shareModeSchema), async (req: TypedRequest<{ mode: 'private' | 'authenticated' | 'public' }, { id: string }>, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'User not authenticated' });

    const { mode } = req.body;

    const doc = await getOwnedDocument(req.params.id, userId, res);
    if (!doc) return;

    const isPublic = mode === 'public';

    if (mode === 'authenticated') {
      await db.query(
        `UPDATE collaborative_documents
         SET share_mode = $1, is_public = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [mode, isPublic, req.params.id]
      );
    } else {
      // Revoke auto-granted permissions when leaving authenticated mode
      await db.query(
        `UPDATE collaborative_documents
         SET share_mode = $1,
             is_public = $2,
             permissions = (
               SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb)
               FROM jsonb_each(COALESCE(permissions, '{}'::jsonb))
               WHERE value->>'granted_by' IS DISTINCT FROM $4
             ),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [mode, isPublic, req.params.id, GRANTED_BY_SHARE_LINK]
      );
    }

    return res.json({
      is_public: isPublic,
      share_permission: doc.share_permission || 'editor',
      share_mode: mode,
    });
  } catch (error: unknown) {
    console.error('[Docs] Error updating share mode:', error);
    return res.status(500).json({ error: 'Failed to update share mode' });
  }
});

export default router;
