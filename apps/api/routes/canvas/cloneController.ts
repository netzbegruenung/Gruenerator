import { Router, type Response } from 'express';
import { type PoolClient } from 'pg';

import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import { checkDocumentAccess } from '../docs/documentAccess.js';

const CANVAS_SUBTYPE = 'canvas';

const router = Router({ mergeParams: true });
const db = getPostgresInstance();

interface CanvasRowForClone {
  id: string;
  title: string;
  created_by: string;
  permissions: Record<string, { level: 'owner' | 'editor' | 'viewer'; granted_at: string }> | null;
  is_public: boolean;
  share_mode?: 'private' | 'authenticated' | 'public';
  template_type: string;
  base_template_id: string | null;
  page_count: number;
  initial_state: Record<string, unknown>;
  format: string;
}

router.post('/:id/clone', async (req, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'User not authenticated' });

    const { id } = req.params as { id: string };

    const sourceRows = (await db.query(
      `SELECT cd.id, cd.title, cd.created_by, cd.permissions, cd.is_public, cd.share_mode,
              cdoc.template_type, cdoc.base_template_id, cdoc.page_count,
              cdoc.initial_state, cdoc.format
       FROM collaborative_documents cd
       INNER JOIN canvas_documents cdoc ON cdoc.document_id = cd.id
       WHERE cd.id = $1 AND cd.document_subtype = $2 AND cd.is_deleted = false`,
      [id, CANVAS_SUBTYPE]
    )) as CanvasRowForClone[];

    if (sourceRows.length === 0) return res.status(404).json({ error: 'Canvas not found' });

    const source = sourceRows[0];

    const access = await checkDocumentAccess(source, userId);
    if (!access.hasAccess) return res.status(403).json({ error: 'Access denied' });

    const sourceInitialState = (source.initial_state ?? {}) as Record<string, unknown>;
    const seededState: Record<string, unknown> = {
      ...sourceInitialState,
      metadata: {
        ...((sourceInitialState.metadata as Record<string, unknown>) ?? {}),
        cloned_from_template_id: source.id,
        cloned_at: new Date().toISOString(),
      },
    };

    const newCanvasId = await db.transaction(async (client: PoolClient) => {
      const docResult = await client.query<{ id: string }>(
        `INSERT INTO collaborative_documents
           (title, content, created_by, last_edited_by, document_subtype, is_public)
         VALUES ($1, $2, $3, $3, $4, false)
         RETURNING id`,
        [`Kopie: ${source.title}`, '', userId, CANVAS_SUBTYPE]
      );
      const newDocumentId = docResult.rows[0].id;

      await client.query(
        `INSERT INTO canvas_documents
           (document_id, template_type, base_template_id, page_count, initial_state, format)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          newDocumentId,
          source.template_type,
          source.base_template_id,
          source.page_count,
          JSON.stringify(seededState),
          source.format,
        ]
      );

      return newDocumentId;
    });

    return res.status(201).json({ newCanvasId, accessMethod: access.accessMethod });
  } catch (error: unknown) {
    console.error('[Canvas/Clone] Error:', error);
    return res.status(500).json({
      error: 'Failed to clone canvas',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
