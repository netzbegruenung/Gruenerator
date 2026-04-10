import { Router, type Request, type Response } from 'express';

import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import { getParam } from '../../utils/params.js';

import { DOCS_SUBTYPES } from './constants.js';
import { checkDocumentAccess, autoGrantSharePermission } from './documentAccess.js';
import { type CollaborativeDocument } from './types.js';

const router = Router();
const db = getPostgresInstance();

/**
 * @route   GET /api/docs/resolve/:id
 * @desc    Resolve a document with optional auth — authenticated users get full access check,
 *          unauthenticated users get public/shared docs only
 * @access  Public (optionalAuth middleware)
 */
router.get('/:id', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const id = getParam(req.params, 'id');
    const userId = req.user?.id;

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

    if (userId) {
      const { hasAccess } = await checkDocumentAccess(document, userId);
      if (!hasAccess) {
        console.warn('[Docs-Resolve] Access denied: user=%s doc=%s', userId, id);
        return res.status(403).json({ error: 'Access denied' });
      }

      autoGrantSharePermission(document, userId);
      return res.json(document);
    }

    console.info(
      '[Docs-Resolve] Guest access: doc=%s share_mode=%s is_public=%s',
      id,
      document.share_mode,
      document.is_public
    );

    if (document.share_mode === 'private' && !document.is_public) {
      console.warn('[Docs-Resolve] Guest rejected: doc=%s is private', id);
      return res.status(404).json({ error: 'Document not found' });
    }

    if (document.share_mode === 'authenticated') {
      console.info('[Docs-Resolve] Guest needs auth: doc=%s', id);
      return res.json({ id: document.id, share_mode: 'authenticated', title: document.title });
    }

    return res.json(document);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Docs] Error resolving document:', error);
    return res.status(500).json({ error: 'Failed to resolve document', details: message });
  }
});

export default router;
