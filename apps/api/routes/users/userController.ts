import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import { validateBody, type TypedRequest } from '../../middleware/validateBody.js';

const router = Router();
const db = getPostgresInstance();

const MIN_QUERY_LENGTH = 2;

/**
 * @route   GET /api/users/search
 * @desc    Search for users by name (substring) or exact email
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

    const term = q.trim();
    if (term.length < MIN_QUERY_LENGTH) {
      return res.json([]);
    }

    // Names match by substring; email only by exact (case-insensitive) address,
    // and the address is only returned for such an exact match.
    const escaped = term.replace(/[\\%_]/g, '\\$&');
    const users = await db.query(
      `SELECT id,
              CASE WHEN LOWER(email) = LOWER($2) THEN email ELSE NULL END AS email,
              display_name, avatar_url
       FROM profiles
       WHERE (LOWER(display_name) LIKE LOWER($1) OR LOWER(email) = LOWER($2))
         AND id != $3
       LIMIT 10`,
      [`%${escaped}%`, term, userId]
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
