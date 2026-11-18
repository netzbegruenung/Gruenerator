import { type Request, type Response } from 'express';
import { z } from 'zod';

import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { validateBody, type TypedRequest } from '../../middleware/validateBody.js';
import { listShareTargetGroups } from '../../services/groups/groupMembership.js';
import {
  addGroupShare,
  GroupShareForbiddenError,
  removeGroupShare,
} from '../../services/groups/groupShareWriter.js';
import { createAuthenticatedRouter } from '../../utils/keycloak/index.js';
import { fromParam, type ThreadId, type GroupId } from '../../utils/types/branded.js';

const router = createAuthenticatedRouter();
const db = getPostgresInstance();

router.get('/:id/groups', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const id = fromParam<ThreadId>(req.params.id);
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const thread = await db.query(
      'SELECT user_id FROM chat_threads WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );
    if ((thread as unknown[]).length === 0)
      return res.status(404).json({ error: 'Thread not found' });
    if ((thread as { user_id: string }[])[0].user_id !== userId) {
      return res.status(403).json({ error: 'Only thread owner can manage sharing' });
    }

    const shares = await db.query(
      `SELECT gcs.group_id, g.name as group_name, gcs.shared_at
       FROM group_content_shares gcs
       INNER JOIN groups g ON g.id = gcs.group_id AND g.deleted_at IS NULL
       WHERE gcs.content_type = 'chat_threads' AND gcs.content_id = $1
       ORDER BY gcs.shared_at DESC`,
      [id]
    );

    return res.json(shares);
  } catch (error: unknown) {
    return res.status(500).json({
      error: 'Failed to fetch thread shares',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

const shareGroupSchema = z.object({
  group_id: z.string().min(1),
});

router.post(
  '/:id/groups',
  validateBody(shareGroupSchema),
  async (req: TypedRequest<z.infer<typeof shareGroupSchema>, { id: string }>, res: Response) => {
    try {
      const id = fromParam<ThreadId>(req.params.id);
      const userId = req.user?.id;
      const { group_id } = req.body;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const thread = await db.query(
        'SELECT user_id FROM chat_threads WHERE id = $1 AND deleted_at IS NULL',
        [id]
      );
      if ((thread as unknown[]).length === 0)
        return res.status(404).json({ error: 'Thread not found' });
      if ((thread as { user_id: string }[])[0].user_id !== userId) {
        return res.status(403).json({ error: 'Only thread owner can share' });
      }

      // Old app path: shares with write access, as it always did.
      let created: boolean;
      try {
        ({ created } = await addGroupShare({
          userId,
          groupId: group_id,
          contentType: 'chat_threads',
          contentId: id,
          permissions: { read: true, write: true },
        }));
      } catch (error) {
        if (!(error instanceof GroupShareForbiddenError)) throw error;
        return res.status(403).json({ error: 'You may not share with this group' });
      }
      if (!created) {
        return res.status(409).json({ error: 'Already shared with this group' });
      }

      return res.status(201).json({ message: 'Thread shared' });
    } catch (error: unknown) {
      return res.status(500).json({
        error: 'Failed to share thread',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

router.delete(
  '/:id/groups/:groupId',
  async (req: Request<{ id: string; groupId: string }>, res: Response) => {
    try {
      const id = fromParam<ThreadId>(req.params.id);
      const groupId = fromParam<GroupId>(req.params.groupId);
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const thread = await db.query(
        'SELECT user_id FROM chat_threads WHERE id = $1 AND deleted_at IS NULL',
        [id]
      );
      if ((thread as unknown[]).length === 0)
        return res.status(404).json({ error: 'Thread not found' });
      if ((thread as { user_id: string }[])[0].user_id !== userId) {
        return res.status(403).json({ error: 'Only thread owner can manage sharing' });
      }

      await removeGroupShare({ groupId, contentType: 'chat_threads', contentId: id });

      return res.json({ message: 'Share removed' });
    } catch (error: unknown) {
      return res.status(500).json({
        error: 'Failed to remove share',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

router.get('/user-groups', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    return res.json(await listShareTargetGroups(userId));
  } catch (error: unknown) {
    return res.status(500).json({
      error: 'Failed to fetch groups',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
