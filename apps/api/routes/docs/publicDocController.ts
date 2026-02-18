import { Router, type Request, type Response } from 'express';

import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';

import { DOCS_SUBTYPES } from './constants.js';

const router = Router();
const db = getPostgresInstance();

/**
 * @route   GET /api/docs/public/:id
 * @desc    Check if a document is publicly accessible (no auth required)
 * @access  Public
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = (await db.query(
      `SELECT id, title, share_permission, share_mode, document_subtype
       FROM collaborative_documents
       WHERE id = $1 AND is_deleted = false AND document_subtype = ANY($2::text[])
         AND (share_mode != 'private' OR is_public = true)`,
      [id, DOCS_SUBTYPES]
    )) as unknown as {
      id: string;
      title: string;
      share_permission: string;
      share_mode: 'private' | 'authenticated' | 'public';
      document_subtype: string;
    }[];

    if (result.length === 0) {
      return res.status(404).json({ error: 'Document not found or not publicly accessible' });
    }

    const doc = result[0];

    if (doc.share_mode === 'authenticated') {
      return res.json({ share_mode: 'authenticated', title: doc.title });
    }

    return res.json(doc);
  } catch (error: any) {
    console.error('[Docs] Error checking public document:', error);
    return res.status(500).json({ error: 'Failed to check document' });
  }
});

export default router;
