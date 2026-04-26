import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import { validateBody, type TypedRequest } from '../../middleware/validateBody.js';
import { checkDocumentAccess } from '../docs/documentAccess.js';

import resizeRouter from './resizeController.js';

import type { CollaborativeDocument } from '../docs/types.js';

const CANVAS_SUBTYPE = 'canvas';

interface CanvasDocumentRow {
  id: string;
  title: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  permissions: Record<string, { level: string; granted_at: string }> | null;
  is_public: boolean;
  template_type: string;
  base_template_id: string | null;
  thumbnail_url: string | null;
  page_count: number;
  initial_state: Record<string, unknown>;
  format: string;
  creator_name?: string;
  [key: string]: unknown;
}

const DEFAULT_CANVAS_FORMAT = 'post-portrait';

const router = Router();
const db = getPostgresInstance();

// Mount the resize sub-router first so POST /:id/resize matches before the
// generic /:id PATCH handler.
router.use(resizeRouter);

const createCanvasSchema = z.object({
  title: z.string().optional(),
  template_type: z.string(),
  base_template_id: z.string().optional(),
  initial_state: z.record(z.unknown()).optional(),
  page_count: z.number().int().positive().optional(),
  format: z.string().optional(),
});

const updateCanvasSchema = z.object({
  title: z.string().optional(),
  thumbnail_url: z.string().optional(),
  page_count: z.number().int().positive().optional(),
  format: z.string().optional(),
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'User not authenticated' });

    const result = (await db.query(
      `SELECT
         cd.id, cd.title, cd.created_by, cd.created_at, cd.updated_at,
         cd.permissions, cd.is_public,
         cdoc.template_type, cdoc.base_template_id, cdoc.thumbnail_url,
         cdoc.page_count, cdoc.initial_state, cdoc.format,
         p.display_name AS creator_name
       FROM collaborative_documents cd
       INNER JOIN canvas_documents cdoc ON cdoc.document_id = cd.id
       LEFT JOIN profiles p ON cd.created_by = p.id
       WHERE
         cd.document_subtype = $1
         AND cd.is_deleted = false
         AND (
           cd.created_by = $2
           OR cd.permissions ? $3::text
           OR cd.id IN (
             SELECT gcs.content_id::uuid
             FROM group_content_shares gcs
             INNER JOIN group_memberships gm
               ON gm.group_id = gcs.group_id AND gm.user_id = $2 AND gm.is_active = TRUE
             WHERE gcs.content_type = 'collaborative_documents'
           )
         )
       ORDER BY cd.updated_at DESC`,
      [CANVAS_SUBTYPE, userId, userId]
    )) as CanvasDocumentRow[];

    return res.json(result);
  } catch (error: unknown) {
    console.error('[Canvas] Error listing canvases:', error);
    return res.status(500).json({
      error: 'Failed to list canvases',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

router.post(
  '/',
  validateBody(createCanvasSchema),
  async (
    req: TypedRequest<{
      title?: string;
      template_type: string;
      base_template_id?: string;
      initial_state?: Record<string, unknown>;
      page_count?: number;
      format?: string;
    }>,
    res: Response
  ) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'User not authenticated' });

      const {
        title = 'Neuer Canvas',
        template_type,
        base_template_id,
        initial_state = {},
        page_count = 1,
        format = DEFAULT_CANVAS_FORMAT,
      } = req.body;

      const docResult = (await db.query(
        `INSERT INTO collaborative_documents
           (title, content, created_by, last_edited_by, document_subtype, is_public)
         VALUES ($1, $2, $3, $3, $4, false)
         RETURNING id, title, created_by, created_at, updated_at, permissions, is_public`,
        [title, '', userId, CANVAS_SUBTYPE]
      )) as CanvasDocumentRow[];

      const documentId = docResult[0].id;

      const sidecar = (await db.query(
        `INSERT INTO canvas_documents
           (document_id, template_type, base_template_id, page_count, initial_state, format)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING template_type, base_template_id, thumbnail_url, page_count, initial_state, format`,
        [
          documentId,
          template_type,
          base_template_id ?? null,
          page_count,
          JSON.stringify(initial_state),
          format,
        ]
      )) as Pick<
        CanvasDocumentRow,
        | 'template_type'
        | 'base_template_id'
        | 'thumbnail_url'
        | 'page_count'
        | 'initial_state'
        | 'format'
      >[];

      return res.status(201).json({ ...docResult[0], ...sidecar[0] });
    } catch (error: unknown) {
      console.error('[Canvas] Error creating canvas:', error);
      return res.status(500).json({
        error: 'Failed to create canvas',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

router.get('/:id', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'User not authenticated' });

    const result = (await db.query(
      `SELECT
         cd.*, cdoc.template_type, cdoc.base_template_id, cdoc.thumbnail_url,
         cdoc.page_count, cdoc.initial_state, cdoc.format,
         p.display_name AS creator_name
       FROM collaborative_documents cd
       INNER JOIN canvas_documents cdoc ON cdoc.document_id = cd.id
       LEFT JOIN profiles p ON cd.created_by = p.id
       WHERE cd.id = $1 AND cd.document_subtype = $2 AND cd.is_deleted = false`,
      [id, CANVAS_SUBTYPE]
    )) as CanvasDocumentRow[];

    if (result.length === 0) return res.status(404).json({ error: 'Canvas not found' });

    const canvas = result[0];
    const access = await checkDocumentAccess(canvas as unknown as CollaborativeDocument, userId);
    if (!access.hasAccess) return res.status(403).json({ error: 'Access denied' });

    return res.json(canvas);
  } catch (error: unknown) {
    console.error('[Canvas] Error fetching canvas:', error);
    return res.status(500).json({
      error: 'Failed to fetch canvas',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

router.patch(
  '/:id',
  validateBody(updateCanvasSchema),
  async (
    req: TypedRequest<
      { title?: string; thumbnail_url?: string; page_count?: number; format?: string },
      { id: string }
    >,
    res: Response
  ) => {
    try {
      const { id } = req.params;
      const userId = req.user?.id;
      const { title, thumbnail_url, page_count, format } = req.body;
      if (!userId) return res.status(401).json({ error: 'User not authenticated' });

      const checkResult = (await db.query(
        `SELECT created_by, permissions FROM collaborative_documents
         WHERE id = $1 AND document_subtype = $2 AND is_deleted = false`,
        [id, CANVAS_SUBTYPE]
      )) as { created_by: string; permissions: Record<string, { level: string }> | null }[];

      if (checkResult.length === 0) return res.status(404).json({ error: 'Canvas not found' });

      const canvas = checkResult[0];
      const userPermission = canvas.permissions?.[userId];
      const canEdit =
        canvas.created_by === userId ||
        (userPermission && ['owner', 'editor'].includes(userPermission.level));
      if (!canEdit) return res.status(403).json({ error: 'Insufficient permissions' });

      if (title !== undefined) {
        await db.query(
          `UPDATE collaborative_documents
           SET title = $1, updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [title, id]
        );
      }

      if (thumbnail_url !== undefined || page_count !== undefined || format !== undefined) {
        const sidecarUpdates: string[] = ['updated_at = CURRENT_TIMESTAMP'];
        const sidecarValues: unknown[] = [];
        let idx = 1;
        if (thumbnail_url !== undefined) {
          sidecarUpdates.push(`thumbnail_url = $${idx++}`);
          sidecarValues.push(thumbnail_url);
        }
        if (page_count !== undefined) {
          sidecarUpdates.push(`page_count = $${idx++}`);
          sidecarValues.push(page_count);
        }
        if (format !== undefined) {
          sidecarUpdates.push(`format = $${idx++}`);
          sidecarValues.push(format);
        }
        sidecarValues.push(id);
        await db.query(
          `UPDATE canvas_documents SET ${sidecarUpdates.join(', ')} WHERE document_id = $${idx}`,
          sidecarValues
        );
      }

      return res.json({ message: 'Canvas updated successfully' });
    } catch (error: unknown) {
      console.error('[Canvas] Error updating canvas:', error);
      return res.status(500).json({
        error: 'Failed to update canvas',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

router.delete('/:id', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'User not authenticated' });

    const checkResult = (await db.query(
      `SELECT created_by, permissions FROM collaborative_documents
       WHERE id = $1 AND document_subtype = $2 AND is_deleted = false`,
      [id, CANVAS_SUBTYPE]
    )) as { created_by: string; permissions: Record<string, { level: string }> | null }[];

    if (checkResult.length === 0) return res.status(404).json({ error: 'Canvas not found' });

    const canvas = checkResult[0];
    const userPermission = canvas.permissions?.[userId];
    const isOwner = canvas.created_by === userId || userPermission?.level === 'owner';
    if (!isOwner) return res.status(403).json({ error: 'Only owners can delete canvases' });

    await db.query(
      'UPDATE collaborative_documents SET is_deleted = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [id]
    );

    return res.json({ message: 'Canvas deleted successfully' });
  } catch (error: unknown) {
    console.error('[Canvas] Error deleting canvas:', error);
    return res.status(500).json({
      error: 'Failed to delete canvas',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
