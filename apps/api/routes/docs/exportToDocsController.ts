import { exportToDocsBodySchema, type ExportToDocsResponse } from '@gruenerator/contracts';
import { Router, type Response } from 'express';
import { type z } from 'zod';

import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import { requireAuth } from '../../middleware/authMiddleware.js';
import { validateBody, type TypedRequest } from '../../middleware/validateBody.js';
import { ensureHtml } from '../../services/docs/contentNormalization.js';
import { seedYjsStateSafe } from '../../services/docs/seedYjsState.js';
import {
  validateAndSanitizeHtml,
  extractTitleFromHtml,
} from '../../services/tiptap/contentConverter.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('exportToDocsController');

const router = Router();
const db = getPostgresInstance();

/**
 * @route   POST /api/docs/from-export
 * @desc    Create a collaborative document from exported content (HTML/Markdown)
 * @access  Private (requires authentication)
 */
router.post(
  '/from-export',
  requireAuth,
  validateBody(exportToDocsBodySchema),
  async (req: TypedRequest<z.infer<typeof exportToDocsBodySchema>>, res: Response) => {
    try {
      const { content, title, documentType } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      if (typeof content !== 'string' || content.length === 0) {
        return res.status(400).json({ error: 'Content is required' });
      }

      const htmlContent = ensureHtml(content);

      let sanitizedContent: string;
      try {
        sanitizedContent = validateAndSanitizeHtml(htmlContent);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return res.status(400).json({ error: message });
      }

      const documentTitle = title || extractTitleFromHtml(sanitizedContent);

      const finalTitle = title || `${documentTitle} - ${new Date().toLocaleDateString('de-DE')}`;

      // Create document in database
      const result = await db.query(
        `INSERT INTO collaborative_documents
          (title, content, created_by, last_edited_by, document_subtype, is_public, permissions)
         VALUES ($1, $2, $3, $3, 'blank', false, $4)
         RETURNING *`,
        [
          finalTitle,
          sanitizedContent,
          userId,
          JSON.stringify({
            [userId]: {
              level: 'owner',
              granted_at: new Date().toISOString(),
            },
          }),
        ]
      );

      const document = result[0];

      await seedYjsStateSafe(document.id as string, sanitizedContent, 'Docs Export');

      log.debug(
        `[Docs Export] User ${userId} created document ${document.id} from export (type: ${documentType || 'unknown'})`
      );

      const response: ExportToDocsResponse = {
        documentId: document.id as string,
        url: `/document/${document.id}`,
        success: true,
      };

      return res.status(201).json(response);
    } catch (error: unknown) {
      log.error('[Docs Export] Error creating document:', { error });

      // Determine appropriate error response
      if (error instanceof Error && error.message?.includes('too large')) {
        return res.status(413).json({
          error: 'Content too large',
          message: 'The content exceeds the maximum size limit of 1MB',
        });
      }

      return res.status(500).json({
        error: 'Failed to create document',
        message: 'An error occurred while creating the document. Please try again.',
      });
    }
  }
);

export default router;
