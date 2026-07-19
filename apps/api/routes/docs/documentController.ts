/**
 * Legacy controller for routes not yet migrated to ts-rest:
 *   - POST /:id/duplicate
 *   - POST /:id/save-as-template
 *
 * Rename (PUT /:id) and soft-delete (DELETE /:id) moved to the ts-rest
 * `docsContractRouter` (updateDocument/deleteDocument), backed by the shared
 * CollaborativeDocumentService. Other migrated routes (create/list/get/…) also
 * live there; it is mounted before this router so it matches first.
 */
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import { validateBody, type TypedRequest } from '../../middleware/validateBody.js';
import { ensureHtml } from '../../services/docs/contentNormalization.js';
import { seedYjsStateSafe } from '../../services/docs/seedYjsState.js';
import {
  snapshotCollaborativeDoc,
  subtypeToTemplateType,
} from '../../services/templates/collaborativeTemplateService.js';

import { DOCS_SUBTYPES } from './constants.js';
import { checkDocumentAccess } from './documentAccess.js';
import { type CollaborativeDocument } from './types.js';

const saveAsTemplateSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  is_private: z.boolean().optional(),
  preview: z.record(z.unknown()).optional(),
  thumbnail_url: z.string().optional(),
  categories: z.array(z.unknown()).optional(),
  tags: z.array(z.unknown()).optional(),
});

const router = Router();
const db = getPostgresInstance();

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

    const { hasAccess: hasAccessToDuplicate } = await checkDocumentAccess(original, userId);

    if (!hasAccessToDuplicate) {
      console.warn(
        '[Docs] POST /api/docs/%s/duplicate — 403: userId=%s, share_mode=%s',
        id,
        userId,
        original.share_mode
      );
      return res.status(403).json({ error: 'Access denied' });
    }

    const newTitle = `${original.title} (Copy)`;
    const duplicatedContent = ensureHtml(original.content || '');
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
        duplicatedContent,
      ]
    )) as CollaborativeDocument[];

    await seedYjsStateSafe(newDoc[0].id, duplicatedContent, 'Docs/duplicate');

    return res.status(201).json(newDoc[0]);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Docs] Error duplicating document:', error);
    return res.status(500).json({ error: 'Failed to duplicate document', details: message });
  }
});

/**
 * @route   POST /api/docs/:id/save-as-template
 * @desc    Snapshot the current Yjs state of a doc/board and store it as a
 *          user_template. Returns the new template id.
 * @access  Private (any user with read access to the document)
 */
router.post(
  '/:id/save-as-template',
  validateBody(saveAsTemplateSchema),
  async (
    req: TypedRequest<z.infer<typeof saveAsTemplateSchema>, { id: string }>,
    res: Response
  ) => {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const checkResult = (await db.query(
        `SELECT id, created_by, permissions, is_public, share_mode, document_subtype, title
         FROM collaborative_documents
         WHERE id = $1 AND document_subtype = ANY($2::text[]) AND is_deleted = false`,
        [id, DOCS_SUBTYPES]
      )) as CollaborativeDocument[];

      if (checkResult.length === 0) {
        return res.status(404).json({ error: 'Document not found' });
      }

      const document = checkResult[0];
      const { hasAccess } = await checkDocumentAccess(document, userId);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const snapshot = await snapshotCollaborativeDoc(id);
      const templateType = subtypeToTemplateType(snapshot.subtype);

      const {
        title,
        description,
        is_private = true,
        preview,
        thumbnail_url,
        categories = [],
        tags = [],
      } = req.body;

      const contentData = {
        yjs: snapshot.yjs,
        subtype: snapshot.subtype,
        ...(preview ? { preview } : {}),
      };

      const inserted = (await db.query(
        `INSERT INTO user_templates
          (user_id, type, title, description, template_type, thumbnail_url,
           images, categories, tags, content_data, metadata, is_private, is_example, status)
         VALUES ($1, 'template', $2, $3, $4, $5,
                 '[]'::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, '{}'::jsonb, $9, false, $10)
         RETURNING id, title, template_type, is_private, status, created_at`,
        [
          userId,
          title.trim(),
          description ? description.trim() : null,
          templateType,
          thumbnail_url || null,
          JSON.stringify(Array.isArray(categories) ? categories : []),
          JSON.stringify(Array.isArray(tags) ? tags : []),
          JSON.stringify(contentData),
          is_private,
          is_private ? 'draft' : 'pending_review',
        ]
      )) as Array<{
        id: string;
        title: string;
        template_type: string;
        is_private: boolean;
        status: string;
        created_at: string;
      }>;

      return res.status(201).json({
        success: true,
        data: inserted[0],
        message: is_private
          ? 'Vorlage wurde erstellt.'
          : 'Vorlage wurde eingereicht und wird geprüft.',
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[Docs] Error saving as template:', error);
      return res.status(500).json({ error: 'Failed to save as template', details: message });
    }
  }
);

export default router;
