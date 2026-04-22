import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import { validateBody, type TypedRequest } from '../../middleware/validateBody.js';
import {
  DOCUMENT_GENERATION_PROMPT,
  parseDocumentResponse,
  createDocumentWithContent,
} from '../../services/docs/DocGenerationService.js';
import { getAIWorkerPool } from '../../utils/getAIWorkerPool.js';
import { createLogger } from '../../utils/logger.js';

import { DOCS_ONLY_SUBTYPES, DOCS_SUBTYPES } from './constants.js';
import { checkDocumentAccess, autoGrantSharePermission } from './documentAccess.js';
import { type CollaborativeDocument } from './types.js';

const createDocSchema = z.object({
  title: z.string().optional(),
  folder_id: z.unknown().optional(),
  document_subtype: z.string().optional(),
});

const generateDocSchema = z.object({
  description: z.string(),
});

const updateDocSchema = z.object({
  title: z.string().optional(),
  folder_id: z.unknown().optional(),
  content: z.string().optional(),
});

const log = createLogger('DocsGenerate');

const router = Router();
const db = getPostgresInstance();

/**
 * @route   POST /api/docs
 * @desc    Create a new collaborative document
 * @access  Private
 */
router.post(
  '/',
  validateBody(createDocSchema),
  async (
    req: TypedRequest<{ title?: string; folder_id?: unknown; document_subtype?: string }>,
    res: Response
  ) => {
    try {
      const {
        title = 'Untitled Document',
        folder_id = null,
        document_subtype = 'blank',
      } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const subtype = DOCS_SUBTYPES.includes(document_subtype) ? document_subtype : 'blank';

      const result = (await db.query(
        `INSERT INTO collaborative_documents
        (title, created_by, last_edited_by, document_subtype, folder_id, permissions, is_public)
       VALUES ($1, $2, $2, $3, $4, $5, false)
       RETURNING *`,
        [
          title,
          userId,
          subtype,
          folder_id,
          JSON.stringify({ [userId]: { level: 'owner', granted_at: new Date().toISOString() } }),
        ]
      )) as CollaborativeDocument[];

      return res.status(201).json(result[0]);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[Docs] Error creating document:', error);
      return res.status(500).json({ error: 'Failed to create document', details: message });
    }
  }
);

/**
 * @route   POST /api/docs/generate
 * @desc    Generate a document using AI based on a description
 * @access  Private
 */
router.post(
  '/generate',
  validateBody(generateDocSchema),
  async (req: TypedRequest<{ description: string }>, res: Response) => {
    try {
      const { description } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      if (description.trim().length < 3) {
        return res.status(400).json({ error: 'Description is required (min 3 characters)' });
      }

      log.info(`Generating document for user ${userId}: "${description.trim().slice(0, 80)}"`);

      const aiResult = await getAIWorkerPool(req).processRequest(
        {
          type: 'doc_generation',
          systemPrompt: DOCUMENT_GENERATION_PROMPT,
          messages: [{ role: 'user', content: description.trim() }],
          options: { temperature: 0.7, max_tokens: 4000 },
        },
        req
      );

      const generated =
        aiResult.success && aiResult.content
          ? parseDocumentResponse(aiResult.content)
          : { title: 'Neues Dokument', subtype: 'blank', content: '' };

      const document = await createDocumentWithContent(
        generated.title,
        generated.content,
        generated.subtype,
        userId
      );

      log.info(`Document created: ${document.id}, subtype: ${generated.subtype}`);
      return res.status(201).json(document);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[Docs] Error generating document:', error);
      return res.status(500).json({ error: 'Failed to generate document', details: message });
    }
  }
);

/**
 * @route   GET /api/docs
 * @desc    List all documents user has access to
 * @access  Private
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const limitParam = Number(req.query.limit);
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : null;

    const params: unknown[] = [userId, userId, DOCS_ONLY_SUBTYPES];
    const limitClause = limit ? `LIMIT $${params.push(limit)}` : '';

    const result = (await db.query(
      `SELECT
        cd.*,
        p.display_name as creator_name,
        le.display_name as last_editor_name,
        CASE
          WHEN cd.created_by = $1 THEN 'owner'
          WHEN cd.permissions ? $2::text THEN 'direct'
          WHEN cd.id IN (
            SELECT gcs.content_id::uuid
            FROM group_content_shares gcs
            INNER JOIN group_memberships gm ON gm.group_id = gcs.group_id AND gm.user_id = $1 AND gm.is_active = TRUE
            WHERE gcs.content_type = 'collaborative_documents'
              AND (gcs.permissions->>'read')::boolean IS NOT FALSE
          ) THEN 'group'
        END AS access_type,
        COALESCE(
          (SELECT json_agg(json_build_object('group_id', g.id, 'group_name', g.name))
           FROM group_content_shares gcs2
           INNER JOIN group_memberships gm2 ON gm2.group_id = gcs2.group_id AND gm2.user_id = $1
           INNER JOIN groups g ON g.id = gcs2.group_id
           WHERE gcs2.content_type = 'collaborative_documents'
             AND gcs2.content_id = cd.id::text
          ), '[]'::json
        ) AS group_shares
       FROM collaborative_documents cd
       LEFT JOIN profiles p ON cd.created_by = p.id
       LEFT JOIN profiles le ON cd.last_edited_by = le.id
       WHERE
        cd.document_subtype = ANY($3::text[])
        AND cd.is_deleted = false
        AND (
          cd.created_by = $1
          OR cd.permissions ? $1::text
          OR cd.id IN (
            SELECT gcs.content_id::uuid
            FROM group_content_shares gcs
            INNER JOIN group_memberships gm ON gm.group_id = gcs.group_id AND gm.user_id = $1 AND gm.is_active = TRUE
            WHERE gcs.content_type = 'collaborative_documents'
              AND (gcs.permissions->>'read')::boolean IS NOT FALSE
          )
        )
       ORDER BY cd.updated_at DESC
       ${limitClause}`,
      params
    )) as CollaborativeDocument[];

    return res.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Docs] Error listing documents:', error);
    return res.status(500).json({ error: 'Failed to list documents', details: message });
  }
});

/**
 * @route   GET /api/docs/:id
 * @desc    Get a specific document's metadata
 * @access  Private
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

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

    const { hasAccess, accessMethod } = await checkDocumentAccess(document, userId);

    if (!hasAccess) {
      console.warn(
        '[Docs] GET /api/docs/%s — 403: userId=%s, accessMethod=%s, share_mode=%s, is_public=%s',
        id,
        userId,
        accessMethod,
        document.share_mode,
        document.is_public
      );
      return res.status(403).json({ error: 'Access denied' });
    }

    autoGrantSharePermission(document, userId);

    return res.json(document);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Docs] Error fetching document:', error);
    return res.status(500).json({ error: 'Failed to fetch document', details: message });
  }
});

/**
 * @route   PUT /api/docs/:id
 * @desc    Update document metadata (title, folder)
 * @access  Private
 */
router.put(
  '/:id',
  validateBody(updateDocSchema),
  async (
    req: TypedRequest<{ title?: string; folder_id?: unknown; content?: string }, { id: string }>,
    res: Response
  ) => {
    try {
      const { id } = req.params;
      const { title, folder_id, content } = req.body;
      const userId = req.user?.id;

      console.log('[docs-rename] PUT /api/docs/%s — userId=%s, body=%o', id, userId, {
        title,
        folder_id,
        content: content !== undefined ? `(${String(content).length} chars)` : undefined,
      });

      if (!userId) {
        console.warn('[docs-rename] PUT /api/docs/%s — 401: no userId', id);
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const checkResult = (await db.query(
        'SELECT permissions, created_by FROM collaborative_documents WHERE id = $1 AND document_subtype = ANY($2::text[]) AND is_deleted = false',
        [id, DOCS_SUBTYPES]
      )) as CollaborativeDocument[];

      if (checkResult.length === 0) {
        console.warn(
          '[docs-rename] PUT /api/docs/%s — 404: document not found (userId=%s)',
          id,
          userId
        );
        return res.status(404).json({ error: 'Document not found' });
      }

      const document = checkResult[0];
      const userPermission = document.permissions?.[userId];
      const isOwner = document.created_by === userId;
      let canEdit =
        isOwner || (userPermission && ['owner', 'editor'].includes(userPermission.level));
      let accessMethod = isOwner
        ? 'owner'
        : userPermission
          ? `direct:${userPermission.level}`
          : 'none';

      if (!canEdit) {
        const groupAccess = (await db.query(
          `SELECT gcs.permissions FROM group_content_shares gcs
         INNER JOIN group_memberships gm ON gm.group_id = gcs.group_id AND gm.user_id = $1 AND gm.is_active = TRUE
         WHERE gcs.content_type = 'collaborative_documents' AND gcs.content_id = $2 LIMIT 1`,
          [userId, id]
        )) as { permissions: { read: boolean; write: boolean } | null }[];

        if (groupAccess.length > 0 && groupAccess[0].permissions?.write === true) {
          canEdit = true;
          accessMethod = 'group:write';
        }
      }

      if (!canEdit) {
        console.warn(
          '[docs-rename] PUT /api/docs/%s — 403: userId=%s, accessMethod=%s, createdBy=%s, permissions=%o',
          id,
          userId,
          accessMethod,
          document.created_by,
          document.permissions
        );
        return res.status(403).json({ error: 'Insufficient permissions to edit document' });
      }

      const updates: string[] = [];
      const values: unknown[] = [];
      let paramIndex = 1;

      if (title !== undefined) {
        updates.push(`title = $${paramIndex++}`);
        values.push(title);
      }

      if (folder_id !== undefined) {
        updates.push(`folder_id = $${paramIndex++}`);
        values.push(folder_id);
      }

      if (content !== undefined) {
        updates.push(`content = $${paramIndex++}`);
        values.push(content);
        updates.push(`last_edited_by = $${paramIndex++}`);
        values.push(userId);
        updates.push(`last_edited_at = CURRENT_TIMESTAMP`);
        updates.push(`updated_at = CURRENT_TIMESTAMP`);
      }

      values.push(id);

      const result = (await db.query(
        `UPDATE collaborative_documents
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING *`,
        values
      )) as CollaborativeDocument[];

      console.log(
        '[docs-rename] PUT /api/docs/%s — success: title="%s", accessMethod=%s',
        id,
        result[0]?.title,
        accessMethod
      );
      return res.json(result[0]);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[Docs] Error updating document:', error);
      return res.status(500).json({ error: 'Failed to update document', details: message });
    }
  }
);

/**
 * @route   DELETE /api/docs/:id
 * @desc    Soft delete a document
 * @access  Private (Owner only)
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const checkResult = (await db.query(
      'SELECT created_by, permissions FROM collaborative_documents WHERE id = $1 AND document_subtype = ANY($2::text[]) AND is_deleted = false',
      [id, DOCS_SUBTYPES]
    )) as CollaborativeDocument[];

    if (checkResult.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const document = checkResult[0];
    const userPermission = document.permissions?.[userId];
    const isOwner =
      document.created_by === userId || (userPermission && userPermission.level === 'owner');

    if (!isOwner) {
      return res.status(403).json({ error: 'Only owners can delete documents' });
    }

    await db.query(
      'UPDATE collaborative_documents SET is_deleted = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [id]
    );

    return res.json({ message: 'Document deleted successfully' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Docs] Error deleting document:', error);
    return res.status(500).json({ error: 'Failed to delete document', details: message });
  }
});

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
        original.content || '',
      ]
    )) as CollaborativeDocument[];

    return res.status(201).json(newDoc[0]);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Docs] Error duplicating document:', error);
    return res.status(500).json({ error: 'Failed to duplicate document', details: message });
  }
});

export default router;
