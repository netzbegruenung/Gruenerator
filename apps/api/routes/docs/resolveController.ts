import { Router, type Request, type Response } from 'express';

import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import { getParam, isUuid } from '../../utils/params.js';

import { DOCS_SUBTYPES } from './constants.js';
import {
  checkDocumentAccess,
  autoGrantSharePermission,
  canWriteDocument,
  redactDocumentForReader,
  type DocumentWriteSubject,
} from './documentAccess.js';
import { type CollaborativeDocument } from './types.js';

const router = Router();
const db = getPostgresInstance();

// A malformed id cannot name a document: answer 404 instead of letting the uuid cast fail as a 500.
router.param('id', (_req, res, next, id: string) => {
  if (!isUuid(id)) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }
  next();
});

function writeSubject(document: CollaborativeDocument): DocumentWriteSubject {
  return {
    ...document,
    share_mode: document.share_mode ?? null,
    share_permission: document.share_permission ?? null,
  };
}

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
        return res.status(403).json({ error: 'Access denied' });
      }

      // can_edit is the editors' only source for write access: the same rule
      // the collab connection enforces, so the UI never offers edits the
      // connection drops, nor hides edits it allows (#4893).
      const can_edit = await canWriteDocument(writeSubject(document), userId);
      autoGrantSharePermission(document, userId);
      return res.json({ ...redactDocumentForReader(document, userId), can_edit });
    }

    if (document.share_mode === 'private' && !document.is_public) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (document.share_mode === 'authenticated') {
      return res.json({ id: document.id, share_mode: 'authenticated', title: document.title });
    }

    const can_edit = await canWriteDocument(writeSubject(document), null);
    return res.json({ ...redactDocumentForReader(document, null), can_edit });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Docs] Error resolving document:', error);
    return res.status(500).json({ error: 'Failed to resolve document', details: message });
  }
});

export default router;
