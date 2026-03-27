import { Router, type Request, type Response } from 'express';

import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';

const router = Router();
const db = getPostgresInstance();
const BOARDS_SUBTYPE = 'boards';

/**
 * @route   GET /api/boards/public/:id
 * @desc    Check if a board is publicly accessible (no auth required)
 * @access  Public
 */
router.get('/:id', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { id } = req.params;

    const result = (await db.query(
      `SELECT cd.id, cd.title, cd.content, cd.share_permission, cd.share_mode,
              p.display_name as creator_name
       FROM collaborative_documents cd
       LEFT JOIN profiles p ON cd.created_by = p.id
       WHERE cd.id = $1 AND cd.document_subtype = $2 AND cd.is_deleted = false
         AND (cd.share_mode != 'private' OR cd.is_public = true)`,
      [id, BOARDS_SUBTYPE]
    )) as {
      id: string;
      title: string;
      content: string | { board_type?: string; is_archived?: boolean } | null;
      share_permission: string;
      share_mode: 'private' | 'authenticated' | 'public';
      creator_name: string | null;
    }[];

    if (result.length === 0) {
      return res.status(404).json({ error: 'Board not found or not publicly accessible' });
    }

    const board = result[0];

    if (board.share_mode === 'authenticated') {
      return res.json({ id: board.id, title: board.title, share_mode: 'authenticated' });
    }

    return res.json(board);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Boards] Error checking public board:', message);
    return res.status(500).json({ error: 'Failed to check board' });
  }
});

export default router;
