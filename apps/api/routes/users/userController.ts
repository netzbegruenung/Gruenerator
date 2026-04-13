import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import { validateBody, type TypedRequest } from '../../middleware/validateBody.js';

const router = Router();
const db = getPostgresInstance();

/**
 * @route   GET /api/users/search
 * @desc    Search for users by name or email
 * @access  Private
 */
router.get('/search', async (req: Request, res: Response) => {
  try {
    const { q } = req.query;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    if (!q || typeof q !== 'string') {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }

    // Search users by display name or email
    const searchPattern = `%${q}%`;
    const users = await db.query(
      `SELECT id, email, display_name, avatar_url
       FROM profiles
       WHERE (LOWER(display_name) LIKE LOWER($1) OR LOWER(email) LIKE LOWER($1))
         AND id != $2
       LIMIT 10`,
      [searchPattern, userId]
    );

    return res.json(users);
  } catch (error: unknown) {
    console.error('[Users] Error searching users:', error);
    return res.status(500).json({
      error: 'Failed to search users',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

const batchSchema = z.object({
  userIds: z.array(z.string()).min(1),
});

/**
 * @route   POST /api/users/batch
 * @desc    Get user profiles by IDs (for BlockNote resolveUsers)
 * @access  Private
 */
router.post(
  '/batch',
  validateBody(batchSchema),
  async (req: TypedRequest<z.infer<typeof batchSchema>>, res: Response) => {
    try {
      const { userIds } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      // Limit to prevent abuse
      const limitedIds = userIds.slice(0, 50);

      const users = await db.query(
        `SELECT id, email, display_name, avatar_url, avatar_robot_id
       FROM profiles
       WHERE id = ANY($1::uuid[])`,
        [limitedIds]
      );

      return res.json(users);
    } catch (error: unknown) {
      console.error('[Users] Error fetching batch users:', error);
      return res.status(500).json({
        error: 'Failed to fetch users',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

export default router;
