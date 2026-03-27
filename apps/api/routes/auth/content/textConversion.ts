import express, { type Router, type Response } from 'express';

import { getPostgresInstance } from '../../../database/services/PostgresService.js';
import authMiddlewareModule from '../../../middleware/authMiddleware.js';
import { createLogger } from '../../../utils/logger.js';

import type { AuthRequest } from '../types.js';

const log = createLogger('textConversion');
const { requireAuth: ensureAuthenticated } = authMiddlewareModule;
const db = getPostgresInstance();
const router: Router = express.Router();

function contentToHtml(content: string): string {
  if (content.includes('<p>') || content.includes('<h')) return content;
  return content
    .split('\n')
    .map((line) => `<p>${line || '<br>'}</p>`)
    .join('');
}

router.post(
  '/saved-texts/:id/convert-to-doc',
  ensureAuthenticated as any,
  async (req: AuthRequest<{ id: string }>, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const { id: textId } = req.params;

      const rows = await db.query(
        'SELECT id, title, content, metadata FROM user_documents WHERE id = $1 AND user_id = $2 AND is_active = true',
        [textId, userId]
      );

      if (rows.length === 0) {
        res.status(404).json({ success: false, message: 'Text nicht gefunden' });
        return;
      }

      const text = rows[0] as {
        id: string;
        title: string;
        content: string;
        metadata: Record<string, unknown> | null;
      };

      const existingDocId =
        text.metadata && typeof text.metadata === 'object'
          ? (text.metadata as Record<string, unknown>).converted_doc_id
          : null;

      if (existingDocId && typeof existingDocId === 'string') {
        const docExists = await db.query(
          'SELECT id FROM collaborative_documents WHERE id = $1 AND is_deleted = false',
          [existingDocId]
        );
        if (docExists.length > 0) {
          res.json({ success: true, documentId: existingDocId, url: `/docs/${existingDocId}` });
          return;
        }
      }

      const htmlContent = contentToHtml(text.content);

      const docResult = await db.query(
        `INSERT INTO collaborative_documents
          (title, content, created_by, last_edited_by, document_subtype, is_public, permissions)
         VALUES ($1, $2, $3, $3, 'blank', false, $4)
         RETURNING id`,
        [
          text.title,
          htmlContent,
          userId,
          JSON.stringify({
            [userId]: { level: 'owner', granted_at: new Date().toISOString() },
          }),
        ]
      );

      const docId = (docResult[0] as { id: string }).id;

      await db.query(
        `UPDATE user_documents SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{converted_doc_id}', $1) WHERE id = $2`,
        [JSON.stringify(docId), textId]
      );

      log.info(`[Convert] Text ${textId} → Doc ${docId} for user ${userId}`);

      res.json({ success: true, documentId: docId, url: `/docs/${docId}` });
    } catch (err: any) {
      log.error('[Convert Text to Doc] Error:', err);
      res.status(500).json({ success: false, message: 'Konvertierung fehlgeschlagen' });
    }
  }
);

export default router;
