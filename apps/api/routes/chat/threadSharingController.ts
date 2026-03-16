import { Router, type Request, type Response } from 'express';

import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { createAuthenticatedRouter } from '../../utils/keycloak/index.js';

const router = createAuthenticatedRouter();
const db = getPostgresInstance();

router.get('/:id/groups', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const thread = await db.query('SELECT user_id FROM chat_threads WHERE id = $1', [id]);
    if ((thread as unknown[]).length === 0)
      return res.status(404).json({ error: 'Thread not found' });
    if ((thread as { user_id: string }[])[0].user_id !== userId) {
      return res.status(403).json({ error: 'Only thread owner can manage sharing' });
    }

    const shares = await db.query(
      `SELECT gcs.group_id, g.name as group_name, gcs.shared_at
       FROM group_content_shares gcs
       INNER JOIN groups g ON g.id = gcs.group_id
       WHERE gcs.content_type = 'chat_threads' AND gcs.content_id = $1
       ORDER BY gcs.shared_at DESC`,
      [id]
    );

    return res.json(shares);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch thread shares', details: error.message });
  }
});

router.post('/:id/groups', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const { group_id } = req.body;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    if (!group_id) return res.status(400).json({ error: 'group_id is required' });

    const thread = await db.query('SELECT user_id FROM chat_threads WHERE id = $1', [id]);
    if ((thread as unknown[]).length === 0)
      return res.status(404).json({ error: 'Thread not found' });
    if ((thread as { user_id: string }[])[0].user_id !== userId) {
      return res.status(403).json({ error: 'Only thread owner can share' });
    }

    const membership = await db.query(
      'SELECT 1 FROM group_memberships WHERE group_id = $1 AND user_id = $2',
      [group_id, userId]
    );
    if ((membership as unknown[]).length === 0) {
      return res.status(403).json({ error: 'You must be a member of the group' });
    }

    const existing = await db.query(
      `SELECT 1 FROM group_content_shares WHERE content_type = 'chat_threads' AND content_id = $1 AND group_id = $2`,
      [id, group_id]
    );
    if ((existing as unknown[]).length > 0) {
      return res.status(409).json({ error: 'Already shared with this group' });
    }

    await db.query(
      `INSERT INTO group_content_shares (content_type, content_id, group_id, shared_by_user_id, permissions)
       VALUES ('chat_threads', $1, $2, $3, '{"read": true, "write": true}')`,
      [id, group_id, userId]
    );

    return res.status(201).json({ message: 'Thread shared' });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to share thread', details: error.message });
  }
});

router.delete(
  '/:id/groups/:groupId',
  async (req: Request<{ id: string; groupId: string }>, res: Response) => {
    try {
      const { id, groupId } = req.params;
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const thread = await db.query('SELECT user_id FROM chat_threads WHERE id = $1', [id]);
      if ((thread as unknown[]).length === 0)
        return res.status(404).json({ error: 'Thread not found' });
      if ((thread as { user_id: string }[])[0].user_id !== userId) {
        return res.status(403).json({ error: 'Only thread owner can manage sharing' });
      }

      await db.query(
        `DELETE FROM group_content_shares WHERE content_type = 'chat_threads' AND content_id = $1 AND group_id = $2`,
        [id, groupId]
      );

      return res.json({ message: 'Share removed' });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to remove share', details: error.message });
    }
  }
);

router.get('/user-groups', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const groups = await db.query(
      `SELECT g.id, g.name, gm.role
       FROM groups g
       INNER JOIN group_memberships gm ON gm.group_id = g.id
       WHERE gm.user_id = $1
       ORDER BY g.name ASC`,
      [userId]
    );

    return res.json(groups);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch groups', details: error.message });
  }
});

export default router;
