/**
 * Canvas Resize / Duplicate-with-Format
 *
 * POST /api/canvas/:id/resize
 *   body: { formatId: string, title?: string }
 *   → 201 { newCanvasId: string }
 *
 * Implements the "Format ändern" UX: the original canvas is left untouched;
 * a new collaborative_documents + canvas_documents row is created carrying
 * the same template_type and initial_state but tagged with the new format.
 *
 * Layouts in initial_state remain in the template's reference coordinate
 * space (1080×1350), so no coordinate translation is needed — the canvas-editor
 * Stage's logical→canvas scale Group handles proportional rendering at the
 * new format's pixel dimensions.
 */

import { Router, type Response } from 'express';
import { z } from 'zod';

import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import { validateBody, type TypedRequest } from '../../middleware/validateBody.js';
import { createLogger } from '../../utils/logger.js';
import { getServerFormat } from '../exports/pageConstants.js';

const log = createLogger('resizeController');

const CANVAS_SUBTYPE = 'canvas';

const router = Router({ mergeParams: true });
const db = getPostgresInstance();

const resizeSchema = z.object({
  formatId: z.string(),
  title: z.string().optional(),
});

interface CanvasRowForResize {
  id: string;
  title: string;
  created_by: string;
  template_type: string;
  base_template_id: string | null;
  page_count: number;
  initial_state: Record<string, unknown>;
}

router.post(
  '/:id/resize',
  validateBody(resizeSchema),
  async (
    req: TypedRequest<{ formatId: string; title?: string }, { id: string }>,
    res: Response
  ) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'User not authenticated' });

      const { id } = req.params;
      const { formatId, title: titleOverride } = req.body;

      if (!getServerFormat(formatId)) {
        return res.status(400).json({ error: `Unbekanntes Format '${formatId}'` });
      }

      const sourceRows = (await db.query(
        `SELECT cd.id, cd.title, cd.created_by,
                cdoc.template_type, cdoc.base_template_id,
                cdoc.page_count, cdoc.initial_state
         FROM collaborative_documents cd
         INNER JOIN canvas_documents cdoc ON cdoc.document_id = cd.id
         WHERE cd.id = $1 AND cd.document_subtype = $2 AND cd.is_deleted = false`,
        [id, CANVAS_SUBTYPE]
      )) as CanvasRowForResize[];

      if (sourceRows.length === 0) {
        return res.status(404).json({ error: 'Canvas not found' });
      }

      const source = sourceRows[0];

      // Permission: must be able to read the source. We treat read access
      // (owner OR explicit permission entry) as sufficient to duplicate.
      const accessRows = (await db.query(
        `SELECT 1 FROM collaborative_documents
         WHERE id = $1
           AND document_subtype = $2
           AND is_deleted = false
           AND (created_by = $3 OR permissions ? $3::text)
         LIMIT 1`,
        [id, CANVAS_SUBTYPE, userId]
      )) as Array<unknown>;

      if (accessRows.length === 0) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const newTitle = titleOverride ?? `${source.title} (${formatId})`;

      const docResult = (await db.query(
        `INSERT INTO collaborative_documents
           (title, content, created_by, last_edited_by, document_subtype, is_public)
         VALUES ($1, $2, $3, $3, $4, false)
         RETURNING id`,
        [newTitle, '', userId, CANVAS_SUBTYPE]
      )) as Array<{ id: string }>;

      const newDocumentId = docResult[0].id;

      await db.query(
        `INSERT INTO canvas_documents
           (document_id, template_type, base_template_id, page_count, initial_state, format)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          newDocumentId,
          source.template_type,
          source.base_template_id,
          source.page_count,
          JSON.stringify(source.initial_state ?? {}),
          formatId,
        ]
      );

      return res.status(201).json({ newCanvasId: newDocumentId });
    } catch (error: unknown) {
      log.error('[Canvas/Resize] Error:', { error });
      return res.status(500).json({
        error: 'Failed to resize canvas',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

export default router;
