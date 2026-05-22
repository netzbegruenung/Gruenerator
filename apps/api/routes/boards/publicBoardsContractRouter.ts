/**
 * ts-rest contract router for the public, unauthenticated board lookup.
 *
 * MUST be mounted BEFORE app.use('/api/boards', requireAuth) in routes.ts, or the
 * public share link gets auth-gated. See publicBoardsContract for the rationale.
 */

import { publicBoardsContract, type BoardContent } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { createLogger } from '../../utils/logger.js';

import type { Application } from 'express';

const log = createLogger('publicBoardsContract');
const BOARDS_SUBTYPE = 'boards';

const db = getPostgresInstance();

interface PublicBoardRow {
  id: string;
  title: string;
  content: BoardContent | null;
  share_permission: string;
  share_mode: 'private' | 'authenticated' | 'public';
  creator_name: string | null;
}

const s = initServer();

export const publicBoardsContractRouter = s.router(publicBoardsContract, {
  getPublicBoard: async (args) => {
    try {
      const { id } = args.params;

      const result = await db.query<PublicBoardRow>(
        `SELECT cd.id, cd.title, cd.content, cd.share_permission, cd.share_mode,
                p.display_name as creator_name
         FROM collaborative_documents cd
         LEFT JOIN profiles p ON cd.created_by = p.id
         WHERE cd.id = $1 AND cd.document_subtype = $2 AND cd.is_deleted = false
           AND (cd.share_mode != 'private' OR cd.is_public = true)`,
        [id, BOARDS_SUBTYPE]
      );

      if (result.length === 0) {
        return {
          status: 404 as const,
          body: { error: 'Board not found or not publicly accessible' },
        };
      }

      const board = result[0];

      if (board.share_mode === 'authenticated') {
        return {
          status: 200 as const,
          body: { id: board.id, title: board.title, share_mode: 'authenticated' as const },
        };
      }

      return { status: 200 as const, body: board };
    } catch (error) {
      log.error('[Boards Contract] Error checking public board:', error);
      return { status: 500 as const, body: { error: 'Failed to check board' } };
    }
  },
});

export function mountPublicBoardsContractRouter(app: Application): void {
  createExpressEndpoints(publicBoardsContract, publicBoardsContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'publicBoardsContract'),
  });
}
