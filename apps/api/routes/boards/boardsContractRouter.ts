/**
 * ts-rest contract router for /api/boards (all authenticated board endpoints).
 *
 * Covers list/create/update/delete/generate plus the read endpoints
 * (GET /:id, /:id/state, /:id/assignable-members). The public, unauthenticated
 * board lookup lives in publicBoardsContractRouter (mounted before requireAuth).
 *
 * Usage in routes.ts:
 *   const { mountBoardsContractRouter } = await import('./routes/boards/boardsContractRouter.js');
 *   mountBoardsContractRouter(app);
 */

import {
  boardsContract,
  type AssignableMember,
  type BoardDocument,
  type BoardState,
} from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import {
  BOARD_GENERATION_PROMPT,
  createBoardDocument,
  loadBoardState,
  parseBoardStructure,
  postProcessBoardStructure,
} from '../../services/boards/BoardService.js';
import {
  GRUENERATOR_BOT_USER_ID,
  GRUENERATOR_BOT_DISPLAY_NAME,
} from '../../services/boards/grueneratorBot.js';
import {
  checkEditAccess,
  softDeleteCollaborativeDocument,
  type QueryRunner,
} from '../../services/docs/CollaborativeDocumentService.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAIWorkerPool } from '../../utils/getAIWorkerPool.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';
import { ensureDocChatThread } from '../chat/services/threadPersistenceService.js';

import { checkBoardAccess } from './boardAccess.js';

import type { Application } from 'express';

const log = createLogger('boardsContract');
const BOARDS_SUBTYPE = 'boards';

// The async board agent is always assignable/mentionable on every board, so the
// @-mention popover can delegate tasks to it without per-board permission setup.
const GRUENERATOR_BOT_MEMBER: AssignableMember = {
  user_id: GRUENERATOR_BOT_USER_ID,
  source: 'bot',
  first_name: GRUENERATOR_BOT_DISPLAY_NAME,
  display_name: GRUENERATOR_BOT_DISPLAY_NAME,
  avatar_robot_id: 1,
};

const db = getPostgresInstance();

// Adapter so board rename/delete share the CollaborativeDocumentService impl,
// scoped to the 'boards' subtype (cross-type mutation stays impossible).
const runQuery: QueryRunner = <T>(sql: string, params?: unknown[]) =>
  db.query(sql, params) as Promise<T[]>;

const s = initServer();

export const boardsContractRouter = s.router(boardsContract, {
  listBoards: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;

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
            OR cd.id IN (
              SELECT gcs.content_id::uuid
              FROM group_content_shares gcs
              INNER JOIN group_memberships gm ON gm.group_id = gcs.group_id AND gm.user_id = $2 AND gm.is_active = TRUE
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

  getBoard: async (args) => {
    try {
      const { id } = args.params;
      const userId = getAuthedUser(args.req).id;

      const result = (await db.query(
        `SELECT cd.*, p.display_name as creator_name
         FROM collaborative_documents cd
         LEFT JOIN profiles p ON cd.created_by = p.id
         WHERE cd.id = $1 AND cd.document_subtype = $2 AND cd.is_deleted = false`,
        [id, BOARDS_SUBTYPE]
      )) as BoardDocument[];

      if (result.length === 0) {
        return { status: 404 as const, body: { error: 'Board not found' } };
      }

      const board = result[0];
      let hasAccess =
        board.created_by === userId ||
        board.is_public ||
        (board.permissions !== null && board.permissions[userId] !== undefined);

      if (!hasAccess) {
        const groupAccess = (await db.query(
          `SELECT 1 FROM group_content_shares gcs
           INNER JOIN group_memberships gm ON gm.group_id = gcs.group_id AND gm.user_id = $1 AND gm.is_active = TRUE
           WHERE gcs.content_type = 'collaborative_documents' AND gcs.content_id = $2 LIMIT 1`,
          [userId, id]
        )) as unknown[];
        hasAccess = groupAccess.length > 0;
      }

      if (!hasAccess) {
        return { status: 403 as const, body: { error: 'Access denied' } };
      }

      return { status: 200 as const, body: board };
    } catch (error) {
      log.error('[Boards Contract] Error fetching board:', error);
      return {
        status: 500 as const,
        body: {
          error: 'Failed to fetch board',
          details: error instanceof Error ? error.message : String(error),
        },
      };
    }
  },

  getBoardState: async (args) => {
    try {
      const { id } = args.params;
      const userId = getAuthedUser(args.req).id;

      const state = await loadBoardState(id, userId);
      if (!state) {
        return { status: 404 as const, body: { error: 'Board not found or access denied' } };
      }

      // loadBoardState casts loose Yjs toJSON() output; the contract type is the
      // canonical strict shape. This is the boundary assertion (no response validation runs).
      return { status: 200 as const, body: state as BoardState };
    } catch (error) {
      log.error('[Boards Contract] Error fetching board state:', error);
      return {
        status: 500 as const,
        body: {
          error: 'Failed to fetch board state',
          details: error instanceof Error ? error.message : String(error),
        },
      };
    }
  },

  getAssignableMembers: async (args) => {
    try {
      const { id } = args.params;
      const userId = getAuthedUser(args.req).id;

      const { hasAccess } = await checkBoardAccess(id, userId);
      if (!hasAccess) {
        return { status: 403 as const, body: { error: 'Access denied' } };
      }

      const members = await db.query<AssignableMember>(
        `WITH assignable AS (
             SELECT cd.created_by AS user_id, 'owner'::text AS source
             FROM collaborative_documents cd
             WHERE cd.id = $1 AND cd.document_subtype = $2 AND cd.is_deleted = false

             UNION

             SELECT perm_key::uuid AS user_id, 'direct'::text AS source
             FROM collaborative_documents cd,
                  LATERAL jsonb_object_keys(COALESCE(cd.permissions, '{}'::jsonb)) AS perm_key
             WHERE cd.id = $1 AND cd.document_subtype = $2 AND cd.is_deleted = false
               AND perm_key ~ '^[0-9a-f-]{36}$'

             UNION

             SELECT gm.user_id, 'group'::text AS source
             FROM group_content_shares gcs
             INNER JOIN group_memberships gm
               ON gm.group_id = gcs.group_id
              AND gm.is_active = TRUE
             WHERE gcs.content_type = 'collaborative_documents'
               AND gcs.content_id = $1::text
           )
           SELECT DISTINCT ON (a.user_id)
             a.user_id,
             a.source,
             p.first_name,
             p.display_name,
             COALESCE(p.avatar_robot_id, 1) AS avatar_robot_id
           FROM assignable a
           INNER JOIN profiles p ON p.id = a.user_id
           ORDER BY a.user_id,
                    CASE a.source WHEN 'owner' THEN 0 WHEN 'direct' THEN 1 ELSE 2 END`,
        [id, BOARDS_SUBTYPE]
      );

      // Surface the async agent first so it's easy to delegate a task to it.
      const withBot = [
        GRUENERATOR_BOT_MEMBER,
        ...members.filter((m) => m.user_id !== GRUENERATOR_BOT_USER_ID),
      ];

      return { status: 200 as const, body: withBot };
    } catch (error) {
      log.error('[Boards Contract] Error listing assignable members:', error);
      return {
        status: 500 as const,
        body: {
          error: 'Failed to list assignable members',
          details: error instanceof Error ? error.message : String(error),
        },
      };
    }
  },

  deleteBoard: async (args) => {
    try {
      const { id } = args.params;
      const userId = getAuthedUser(args.req).id;

      // Shared soft-delete impl, scoped to the boards subtype.
      const result = await softDeleteCollaborativeDocument(runQuery, id, userId, [BOARDS_SUBTYPE]);
      if (result.status === 'not_found') {
        return { status: 404 as const, body: { error: 'Board not found' } };
      }
      if (result.status === 'forbidden') {
        return { status: 403 as const, body: { error: 'Only owners can delete boards' } };
      }

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
      const userId = getAuthedUser(args.req).id;

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
      const userId = getAuthedUser(args.req).id;

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

  getChatThread: async (args) => {
    try {
      const { id } = args.params;
      const userId = getAuthedUser(args.req).id;

      const { hasAccess, createdBy } = await checkBoardAccess(id, userId);
      if (!createdBy) {
        return { status: 404 as const, body: { error: 'Board not found' } };
      }
      if (!hasAccess) {
        return { status: 403 as const, body: { error: 'Access denied' } };
      }

      // One shared thread per board, keyed by the board id (a collaborative_documents
      // row) on chat_threads.doc_id. Owner is the thread's user_id, matching docs.
      const thread = await ensureDocChatThread(id, createdBy, 'gruenerator-boards-editor');
      return { status: 200 as const, body: { threadId: thread.id } };
    } catch (error) {
      log.error('[Boards Contract] Error resolving chat thread:', error);
      return {
        status: 500 as const,
        body: {
          error: 'Failed to resolve chat thread',
          details: error instanceof Error ? error.message : String(error),
        },
      };
    }
  },


  duplicateBoard: async (args) => {
    try {
      const { id } = args.params;
      const userId = getAuthedUser(args.req).id;

      const { hasAccess } = await checkBoardAccess(id, userId);
      if (!hasAccess) return { status: 403 as const, body: { error: 'Kein Zugriff' } };

      // Load the source structure (fields/rows/views) + its description.
      const source = await loadBoardState(id, userId);
      if (!source) return { status: 404 as const, body: { error: 'Board not found' } };

      const descRows = (await db.query(
        'SELECT description FROM collaborative_documents WHERE id = $1',
        [id]
      )) as { description: string | null }[];

      const boardType = source.boardType === 'whiteboard' ? 'whiteboard' : 'kanban';
      const created = await createBoardDocument(`${source.title} (Kopie)`, userId, boardType);

      const description = descRows[0]?.description ?? null;
      if (description) {
        await db.query('UPDATE collaborative_documents SET description = $1 WHERE id = $2', [
          description,
          created.id,
        ]);
      }

      // The client seeds the cloned structure into the new board's Yjs doc on
      // navigation — same path as generateBoard. Relational tails are NOT copied.
      const board = (await db.query(
        `SELECT cd.*, p.display_name as creator_name
         FROM collaborative_documents cd
         LEFT JOIN profiles p ON cd.created_by = p.id
         WHERE cd.id = $1`,
        [created.id]
      )) as BoardDocument[];

      return {
        status: 201 as const,
        body: {
          board: board[0],
          generatedStructure: {
            fields: source.fields,
            rows: source.rows,
            views: source.views,
          },
        },
      };
    } catch (error) {
      log.error('[Boards Contract] Error duplicating board:', error);
      return {
        status: 500 as const,
        body: {
          error: 'Failed to duplicate board',
          details: error instanceof Error ? error.message : String(error),
        },
      };
    }
  },

  updateBoard: async (args) => {
    try {
      const { id } = args.params;
      const { title, is_archived, description } = args.body;
      const userId = getAuthedUser(args.req).id;

      // Shared access check (owner / editor / group-write), scoped to boards.
      // Board-only fields (is_archived, description) stay inline below.
      const access = await checkEditAccess(runQuery, id, userId, [BOARDS_SUBTYPE]);
      if (access.status === 'not_found') {
        return { status: 404 as const, body: { error: 'Board not found' } };
      }
      if (access.status === 'forbidden') {
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
      if (description !== undefined) {
        updates.push(`description = $${paramIndex++}`);
        values.push(description); // null clears it
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
