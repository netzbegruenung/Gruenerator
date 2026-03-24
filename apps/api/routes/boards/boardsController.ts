import { Router, type Request, type Response } from 'express';

import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import {
  BOARD_GENERATION_PROMPT,
  createBoardDocument,
  loadBoardState,
  parseBoardStructure,
  postProcessBoardStructure,
} from '../../services/boards/BoardService.js';

const BOARDS_SUBTYPE = 'boards';

interface BoardDocument {
  id: string;
  title: string;
  created_by: string;
  last_edited_by: string;
  document_subtype: string;
  permissions: Record<string, { level: string; granted_at: string }> | null;
  is_public: boolean;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  creator_name?: string;
  [key: string]: unknown;
}

const router = Router();
const db = getPostgresInstance();

router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const result = (await db.query(
      `SELECT
        cd.id, cd.title, cd.created_by, cd.last_edited_by,
        cd.created_at, cd.updated_at, cd.permissions, cd.is_public,
        cd.content,
        p.display_name as creator_name
       FROM collaborative_documents cd
       LEFT JOIN profiles p ON cd.created_by = p.id
       WHERE
        cd.document_subtype = $1
        AND cd.is_deleted = false
        AND (
          cd.created_by = $2
          OR cd.permissions ? $3
          OR cd.is_public = true
          OR cd.id IN (
            SELECT gcs.content_id::uuid
            FROM group_content_shares gcs
            INNER JOIN group_memberships gm ON gm.group_id = gcs.group_id AND gm.user_id = $2
            WHERE gcs.content_type = 'collaborative_documents'
          )
        )
       ORDER BY cd.updated_at DESC`,
      [BOARDS_SUBTYPE, userId, userId]
    )) as BoardDocument[];

    return res.json(result);
  } catch (error: any) {
    console.error('[Boards] Error listing boards:', error);
    return res.status(500).json({ error: 'Failed to list boards', details: error.message });
  }
});

router.post('/generate', async (req: Request, res: Response) => {
  try {
    const { description } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    if (!description || typeof description !== 'string' || description.trim().length < 3) {
      return res.status(400).json({ error: 'Description is required (min 3 characters)' });
    }

    const aiResult = await req.app.locals.aiWorkerPool.processRequest(
      {
        type: 'board_generation',
        systemPrompt: BOARD_GENERATION_PROMPT,
        messages: [{ role: 'user', content: description.trim() }],
        options: { temperature: 0.7, max_tokens: 2000 },
      },
      req
    );

    if (!aiResult.success || !aiResult.content) {
      const fallback = await createBoardDocument('Neues Board', userId);
      return res.status(201).json({ board: fallback, generatedStructure: null });
    }

    const structure = parseBoardStructure(aiResult.content);
    if (!structure) {
      const fallback = await createBoardDocument('Neues Board', userId);
      return res.status(201).json({ board: fallback, generatedStructure: null });
    }

    const board = await createBoardDocument(structure.title || 'Neues Board', userId);
    const generatedStructure = postProcessBoardStructure(structure, userId);

    return res.status(201).json({ board, generatedStructure });
  } catch (error: any) {
    console.error('[Boards] Error generating board:', error);
    return res.status(500).json({ error: 'Failed to generate board', details: error.message });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { title = 'Neues Board', boardType } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const board = await createBoardDocument(title, userId, boardType);
    return res.status(201).json(board);
  } catch (error: any) {
    console.error('[Boards] Error creating board:', error);
    return res.status(500).json({ error: 'Failed to create board', details: error.message });
  }
});

router.get('/:id', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const result = (await db.query(
      `SELECT cd.*, p.display_name as creator_name
       FROM collaborative_documents cd
       LEFT JOIN profiles p ON cd.created_by = p.id
       WHERE cd.id = $1 AND cd.document_subtype = $2 AND cd.is_deleted = false`,
      [id, BOARDS_SUBTYPE]
    )) as BoardDocument[];

    if (result.length === 0) {
      return res.status(404).json({ error: 'Board not found' });
    }

    const board = result[0];
    let hasAccess =
      board.created_by === userId ||
      board.is_public ||
      (board.permissions && board.permissions[userId]);

    if (!hasAccess) {
      const groupAccess = (await db.query(
        `SELECT gcs.permissions FROM group_content_shares gcs
         INNER JOIN group_memberships gm ON gm.group_id = gcs.group_id AND gm.user_id = $1
         WHERE gcs.content_type = 'collaborative_documents' AND gcs.content_id = $2 LIMIT 1`,
        [userId, id]
      )) as { permissions: { read: boolean; write: boolean } | null }[];

      if (groupAccess.length > 0) {
        hasAccess = true;
      }
    }

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    return res.json(board);
  } catch (error: any) {
    console.error('[Boards] Error fetching board:', error);
    return res.status(500).json({ error: 'Failed to fetch board', details: error.message });
  }
});

router.get('/:id/state', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const state = await loadBoardState(id, userId);
    if (!state) {
      return res.status(404).json({ error: 'Board not found or access denied' });
    }

    return res.json(state);
  } catch (error: any) {
    console.error('[Boards] Error fetching board state:', error);
    return res.status(500).json({ error: 'Failed to fetch board state', details: error.message });
  }
});

router.put('/:id', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { id } = req.params;
    const { title, is_archived } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const checkResult = (await db.query(
      'SELECT created_by, permissions FROM collaborative_documents WHERE id = $1 AND document_subtype = $2 AND is_deleted = false',
      [id, BOARDS_SUBTYPE]
    )) as BoardDocument[];

    if (checkResult.length === 0) {
      return res.status(404).json({ error: 'Board not found' });
    }

    const board = checkResult[0];
    const userPermission = board.permissions?.[userId];
    const isOwner = board.created_by === userId;
    const canEdit =
      isOwner || (userPermission && ['owner', 'editor'].includes(userPermission.level));

    if (!canEdit) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const updates: string[] = ['updated_at = CURRENT_TIMESTAMP'];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (title !== undefined) {
      updates.push(`title = $${paramIndex++}`);
      values.push(title);
    }
    if (is_archived !== undefined) {
      updates.push(
        `content = jsonb_set(COALESCE(content, '{}')::jsonb, '{is_archived}', $${paramIndex++}::jsonb)`
      );
      values.push(JSON.stringify(!!is_archived));
    }

    values.push(id);

    const result = (await db.query(
      `UPDATE collaborative_documents
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    )) as BoardDocument[];

    return res.json(result[0]);
  } catch (error: any) {
    console.error('[Boards] Error updating board:', error);
    return res.status(500).json({ error: 'Failed to update board', details: error.message });
  }
});

router.delete('/:id', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const checkResult = (await db.query(
      'SELECT created_by, permissions FROM collaborative_documents WHERE id = $1 AND document_subtype = $2 AND is_deleted = false',
      [id, BOARDS_SUBTYPE]
    )) as BoardDocument[];

    if (checkResult.length === 0) {
      return res.status(404).json({ error: 'Board not found' });
    }

    const board = checkResult[0];
    const userPermission = board.permissions?.[userId];
    const isOwner = board.created_by === userId || userPermission?.level === 'owner';

    if (!isOwner) {
      return res.status(403).json({ error: 'Only owners can delete boards' });
    }

    await db.query(
      'UPDATE collaborative_documents SET is_deleted = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [id]
    );

    return res.json({ message: 'Board deleted successfully' });
  } catch (error: any) {
    console.error('[Boards] Error deleting board:', error);
    return res.status(500).json({ error: 'Failed to delete board', details: error.message });
  }
});

export default router;
