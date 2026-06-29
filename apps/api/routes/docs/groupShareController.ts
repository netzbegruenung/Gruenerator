import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import { validateBody, type TypedRequest } from '../../middleware/validateBody.js';
import { getDocPreview } from '../../services/docs/docPreview.js';

const router = Router();
const db = getPostgresInstance();

interface GroupShareRow {
  group_id: string;
  group_name: string;
  permissions: { read: boolean; write: boolean } | null;
  shared_at: string;
  shared_by_user_id: string;
  [key: string]: unknown;
}

interface UserGroupRow {
  id: string;
  name: string;
  role: string;
  [key: string]: unknown;
}

const addGroupSchema = z.object({
  group_id: z.string(),
  permission_level: z.enum(['viewer', 'editor']).optional(),
});

const updateGroupSchema = z.object({
  permission_level: z.enum(['viewer', 'editor']),
});

/**
 * @route   GET /api/docs/groups/me
 * @desc    List groups the current user belongs to (for ShareModal dropdown).
 *          Path is intentionally 4 segments (`/docs/groups/me`) so it cannot
 *          be intercepted by the docs contract router's `/api/docs/:id`
 *          (3 segments) or `/api/docs/:id/permissions` (4 segments, literal
 *          `permissions`) routes — see commit fixing the user-groups → uuid
 *          cast crash.
 * @access  Private
 */
router.get('/groups/me', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const groups = (await db.query(
      `SELECT g.id, g.name, gm.role
       FROM groups g
       INNER JOIN group_memberships gm ON gm.group_id = g.id
       WHERE gm.user_id = $1
       ORDER BY g.name ASC`,
      [userId]
    )) as UserGroupRow[];

    return res.json(groups);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Docs] Error fetching user groups:', error);
    return res.status(500).json({ error: 'Failed to fetch user groups', details: message });
  }
});

/**
 * @route   GET /api/docs/:id/groups
 * @desc    List groups this document is shared with
 * @access  Private (document owner only)
 */
router.get('/:id/groups', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const doc = (await db.query(
      'SELECT created_by FROM collaborative_documents WHERE id = $1 AND is_deleted = false',
      [id]
    )) as { created_by: string }[];

    if (doc.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (doc[0].created_by !== userId) {
      console.error(
        '[Docs] Group share 403: created_by=%s, userId=%s, docId=%s',
        doc[0].created_by,
        userId,
        id
      );
      return res.status(403).json({ error: 'Only document owner can manage group sharing' });
    }

    const shares = (await db.query(
      `SELECT
        gcs.group_id,
        g.name as group_name,
        gcs.permissions,
        gcs.shared_at,
        gcs.shared_by_user_id
       FROM group_content_shares gcs
       INNER JOIN groups g ON g.id = gcs.group_id
       WHERE gcs.content_type = 'collaborative_documents'
         AND gcs.content_id = $1
       ORDER BY gcs.shared_at DESC`,
      [id]
    )) as GroupShareRow[];

    const result = shares.map((s) => ({
      group_id: s.group_id,
      group_name: s.group_name,
      permission_level: s.permissions?.write ? 'editor' : 'viewer',
      shared_at: s.shared_at,
    }));

    return res.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Docs] Error fetching group shares:', error);
    return res.status(500).json({ error: 'Failed to fetch group shares', details: message });
  }
});

/**
 * @route   POST /api/docs/:id/groups
 * @desc    Share document with a group
 * @access  Private (document owner + group member)
 */
router.post(
  '/:id/groups',
  validateBody(addGroupSchema),
  async (
    req: TypedRequest<{ group_id: string; permission_level?: 'viewer' | 'editor' }, { id: string }>,
    res: Response
  ) => {
    try {
      const { id } = req.params;
      const userId = req.user?.id;
      const { group_id, permission_level = 'viewer' } = req.body;

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const doc = (await db.query(
        'SELECT created_by, title FROM collaborative_documents WHERE id = $1 AND is_deleted = false',
        [id]
      )) as { created_by: string; title?: string }[];

      if (doc.length === 0) {
        return res.status(404).json({ error: 'Document not found' });
      }

      if (doc[0].created_by !== userId) {
        return res.status(403).json({ error: 'Only document owner can share with groups' });
      }

      const membership = (await db.query(
        'SELECT user_id FROM group_memberships WHERE group_id = $1 AND user_id = $2',
        [group_id, userId]
      )) as { user_id: string }[];

      if (membership.length === 0) {
        return res
          .status(403)
          .json({ error: 'You must be a member of the group to share with it' });
      }

      const existing = (await db.query(
        `SELECT id FROM group_content_shares
       WHERE content_type = 'collaborative_documents' AND content_id = $1 AND group_id = $2`,
        [id, group_id]
      )) as { id: string }[];

      if (existing.length > 0) {
        return res.status(409).json({ error: 'Document is already shared with this group' });
      }

      const permissions = {
        read: true,
        write: permission_level === 'editor',
      };

      await db.query(
        `INSERT INTO group_content_shares (content_type, content_id, group_id, shared_by_user_id, permissions)
       VALUES ('collaborative_documents', $1, $2, $3, $4)`,
        [id, group_id, userId, JSON.stringify(permissions)]
      );

      // Notify group members
      const sharerName = req.user?.display_name || 'Jemand';
      const docTitle = doc[0].title || 'ein Dokument';
      const docPreview = await getDocPreview(id);
      import('../../services/notifications/index.js')
        .then(({ notifyGroupMembers }) =>
          notifyGroupMembers({
            groupId: group_id,
            excludeUserId: userId,
            type: 'group_content_shared',
            title: 'Dokument geteilt',
            body: `${sharerName} hat „${docTitle}" geteilt`,
            actionUrl: `/docs/${id}`,
            metadata: {
              documentId: id,
              groupId: group_id,
              docTitle,
              actorName: sharerName,
              ...(docPreview?.snippet ? { docPreview: docPreview.snippet } : {}),
            },
          })
        )
        .catch(() => {});

      return res.status(201).json({ message: 'Document shared with group successfully' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[Docs] Error sharing document with group:', error);
      return res
        .status(500)
        .json({ error: 'Failed to share document with group', details: message });
    }
  }
);

/**
 * @route   PUT /api/docs/:id/groups/:groupId
 * @desc    Update group permission level for a document
 * @access  Private (document owner)
 */
router.put(
  '/:id/groups/:groupId',
  validateBody(updateGroupSchema),
  async (
    req: TypedRequest<{ permission_level: 'viewer' | 'editor' }, { id: string; groupId: string }>,
    res: Response
  ) => {
    try {
      const { id, groupId } = req.params;
      const userId = req.user?.id;
      const { permission_level } = req.body;

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const doc = (await db.query(
        'SELECT created_by FROM collaborative_documents WHERE id = $1 AND is_deleted = false',
        [id]
      )) as { created_by: string }[];

      if (doc.length === 0) {
        return res.status(404).json({ error: 'Document not found' });
      }

      if (doc[0].created_by !== userId) {
        return res.status(403).json({ error: 'Only document owner can update group permissions' });
      }

      const permissions = {
        read: true,
        write: permission_level === 'editor',
      };

      const result = await db.query(
        `UPDATE group_content_shares
       SET permissions = $1
       WHERE content_type = 'collaborative_documents' AND content_id = $2 AND group_id = $3
       RETURNING id`,
        [JSON.stringify(permissions), id, groupId]
      );

      if (!result || (result as unknown[]).length === 0) {
        return res.status(404).json({ error: 'Group share not found' });
      }

      return res.json({ message: 'Group permission updated successfully' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[Docs] Error updating group share:', error);
      return res.status(500).json({ error: 'Failed to update group permission', details: message });
    }
  }
);

/**
 * @route   DELETE /api/docs/:id/groups/:groupId
 * @desc    Unshare document from a group
 * @access  Private (document owner)
 */
router.delete('/:id/groups/:groupId', async (req: Request, res: Response) => {
  try {
    const { id, groupId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const doc = (await db.query(
      'SELECT created_by FROM collaborative_documents WHERE id = $1 AND is_deleted = false',
      [id]
    )) as { created_by: string }[];

    if (doc.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (doc[0].created_by !== userId) {
      return res.status(403).json({ error: 'Only document owner can unshare from groups' });
    }

    const result = await db.query(
      `DELETE FROM group_content_shares
       WHERE content_type = 'collaborative_documents' AND content_id = $1 AND group_id = $2
       RETURNING id`,
      [id, groupId]
    );

    if (!result || (result as unknown[]).length === 0) {
      return res.status(404).json({ error: 'Group share not found' });
    }

    return res.json({ message: 'Document unshared from group successfully' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Docs] Error unsharing document from group:', error);
    return res
      .status(500)
      .json({ error: 'Failed to unshare document from group', details: message });
  }
});

export default router;
