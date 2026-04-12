/**
 * ts-rest contract router for /api/boards (write endpoints only)
 *
 * Covers the three validateBody-guarded routes from boardsController.ts:
 *   POST /api/boards/generate
 *   POST /api/boards
 *   PUT  /api/boards/:id
 *
 * Mount this BEFORE the legacy boardsRouter in routes.ts so ts-rest
 * matches first; unmatched GET routes fall through to the legacy router.
 *
 * Usage in routes.ts:
 *   const { mountBoardsContractRouter } = await import('./routes/boards/boardsContractRouter.js');
 *   mountBoardsContractRouter(app);
 */

import { boardsContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import {
  BOARD_GENERATION_PROMPT,
  createBoardDocument,
  parseBoardStructure,
  postProcessBoardStructure,
} from '../../services/boards/BoardService.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAIWorkerPool } from '../../utils/getAIWorkerPool.js';
import { createLogger } from '../../utils/logger.js';

import type { UserProfile } from '../../services/user/types.js';
import type { Application, Request } from 'express';

const log = createLogger('boardsContract');
const BOARDS_SUBTYPE = 'boards';

function getUserId(req: Request): string {
  return (req.user as UserProfile).id;
}

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

const db = getPostgresInstance();

const s = initServer();

export const boardsContractRouter = s.router(boardsContract, {
  listBoards: async (args) => {
    try {
      const userId = getUserId(args.req);

      const result = (await db.query(
        `SELECT
          cd.id, cd.title, cd.created_by, cd.last_edited_by,
          cd.document_subtype, cd.permissions, cd.is_public, cd.is_deleted,
          cd.created_at, cd.updated_at, cd.content,
          p.display_name as creator_name
         FROM collaborative_documents cd
         LEFT JOIN profiles p ON cd.created_by = p.id
         WHERE
          cd.document_subtype = $1
          AND cd.is_deleted = false
          AND (
            cd.created_by = $2
            OR cd.permissions ? $3::text
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

      return { status: 200 as const, body: result };
    } catch (error) {
      log.error('[Boards Contract] Error listing boards:', error);
      return {
        status: 500 as const,
        body: {
          error: 'Failed to list boards',
          details: error instanceof Error ? error.message : String(error),
        },
      };
    }
  },

  deleteBoard: async (args) => {
    try {
      const { id } = args.params;
      const userId = getUserId(args.req);

      const checkResult = (await db.query(
        'SELECT created_by, permissions FROM collaborative_documents WHERE id = $1 AND document_subtype = $2 AND is_deleted = false',
        [id, BOARDS_SUBTYPE]
      )) as BoardDocument[];

      if (checkResult.length === 0) {
        return { status: 404 as const, body: { error: 'Board not found' } };
      }

      const board = checkResult[0];
      const userPermission = board.permissions?.[userId];
      const isOwner = board.created_by === userId || userPermission?.level === 'owner';

      if (!isOwner) {
        return { status: 403 as const, body: { error: 'Only owners can delete boards' } };
      }

      await db.query(
        'UPDATE collaborative_documents SET is_deleted = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [id]
      );

      return { status: 200 as const, body: { message: 'Board deleted successfully' } };
    } catch (error) {
      log.error('[Boards Contract] Error deleting board:', error);
      return {
        status: 500 as const,
        body: {
          error: 'Failed to delete board',
          details: error instanceof Error ? error.message : String(error),
        },
      };
    }
  },

  generateBoard: async (args) => {
    try {
      const { description } = args.body;
      const userId = getUserId(args.req);

      if (description.trim().length < 3) {
        return {
          status: 400 as const,
          body: { error: 'Description is required (min 3 characters)' },
        };
      }

      const aiResult = await getAIWorkerPool(args.req).processRequest(
        {
          type: 'board_generation',
          systemPrompt: BOARD_GENERATION_PROMPT,
          messages: [{ role: 'user', content: description.trim() }],
          options: { temperature: 0.7, max_tokens: 2000 },
        },
        args.req
      );

      if (!aiResult.success || !aiResult.content) {
        const fallback = await createBoardDocument('Neues Board', userId);
        return {
          status: 201 as const,
          body: { board: fallback as BoardDocument, generatedStructure: null },
        };
      }

      const structure = parseBoardStructure(aiResult.content);
      if (!structure) {
        const fallback = await createBoardDocument('Neues Board', userId);
        return {
          status: 201 as const,
          body: { board: fallback as BoardDocument, generatedStructure: null },
        };
      }

      const board = await createBoardDocument(structure.title || 'Neues Board', userId);
      const generatedStructure = postProcessBoardStructure(structure, userId);

      return { status: 201 as const, body: { board: board as BoardDocument, generatedStructure } };
    } catch (error) {
      log.error('[Boards Contract] Error generating board:', error);
      return {
        status: 500 as const,
        body: {
          error: 'Failed to generate board',
          details: error instanceof Error ? error.message : String(error),
        },
      };
    }
  },

  createBoard: async (args) => {
    try {
      const { title = 'Neues Board', boardType } = args.body;
      const userId = getUserId(args.req);

      const board = await createBoardDocument(title, userId, boardType);
      return { status: 201 as const, body: board as BoardDocument };
    } catch (error) {
      log.error('[Boards Contract] Error creating board:', error);
      return {
        status: 500 as const,
        body: {
          error: 'Failed to create board',
          details: error instanceof Error ? error.message : String(error),
        },
      };
    }
  },

  updateBoard: async (args) => {
    try {
      const { id } = args.params;
      const { title, is_archived } = args.body;
      const userId = getUserId(args.req);

      const checkResult = (await db.query(
        'SELECT created_by, permissions FROM collaborative_documents WHERE id = $1 AND document_subtype = $2 AND is_deleted = false',
        [id, BOARDS_SUBTYPE]
      )) as BoardDocument[];

      if (checkResult.length === 0) {
        return { status: 404 as const, body: { error: 'Board not found' } };
      }

      const board = checkResult[0];
      const userPermission = board.permissions?.[userId];
      const isOwner = board.created_by === userId;
      const canEdit =
        isOwner ||
        (userPermission !== undefined &&
          userPermission !== null &&
          ['owner', 'editor'].includes(userPermission.level));

      if (!canEdit) {
        return { status: 403 as const, body: { error: 'Insufficient permissions' } };
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

      return { status: 200 as const, body: result[0] };
    } catch (error) {
      log.error('[Boards Contract] Error updating board:', error);
      return {
        status: 500 as const,
        body: {
          error: 'Failed to update board',
          details: error instanceof Error ? error.message : String(error),
        },
      };
    }
  },
});

/**
 * Mount the ts-rest boards contract router onto an Express app instance.
 * Call this from routes.ts BEFORE the legacy requireAuth + boardsRouter mount.
 */
export function mountBoardsContractRouter(app: Application): void {
  createExpressEndpoints(boardsContract, boardsContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'boardsContract'),
  });
}
