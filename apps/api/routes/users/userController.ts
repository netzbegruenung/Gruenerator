import { Router, Request, Response } from 'express';
import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';

const router = Router();
const db = getPostgresInstance();

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email?: string;
    display_name?: string;
  };
}

/**
 * @route   GET /api/users/search
 * @desc    Search for users by name or email
 * @access  Private
 */
router.get('/search', async (req: AuthenticatedRequest, res: Response) => {
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
  } catch (error: any) {
    console.error('[Users] Error searching users:', error);
    return res.status(500).json({ error: 'Failed to search users', details: error.message });
  }
});

export default router;
