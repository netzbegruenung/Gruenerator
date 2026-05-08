/**
 * Legacy controller for routes that haven't been migrated to ts-rest yet:
 *   - PUT /:id (update)
 *   - DELETE /:id (soft delete)
 *   - POST /:id/duplicate
 *
 * Migrated routes (createDocument, generateDocument, listDocuments,
 * getDocumentById) live in docsContractRouter.ts and are mounted at the
 * app level before this router, so they take precedence.
 */
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import { validateBody, type TypedRequest } from '../../middleware/validateBody.js';

import { DOCS_SUBTYPES } from './constants.js';
import { checkDocumentAccess } from './documentAccess.js';
import { type CollaborativeDocument } from './types.js';

const updateDocSchema = z.object({
  title: z.string().optional(),
  folder_id: z.unknown().optional(),
  content: z.string().optional(),
  wolke_live_sync: z.boolean().optional(),
});

const router = Router();
const db = getPostgresInstance();

/**
 * @route   PUT /api/docs/:id
 * @desc    Update document metadata (title, folder)
 * @access  Private
 */
router.put(
  '/:id',
  validateBody(updateDocSchema),
  async (
    req: TypedRequest<
      { title?: string; folder_id?: unknown; content?: string; wolke_live_sync?: boolean },
      { id: string }
    >,
    res: Response
  ) => {
    try {
      const { id } = req.params;
      const { title, folder_id, content, wolke_live_sync } = req.body;
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

      if (wolke_live_sync !== undefined) {
        updates.push(`wolke_live_sync = $${paramIndex++}`);
        values.push(wolke_live_sync);
      }

      if (updates.length === 0) {
        return res.json(document);
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
