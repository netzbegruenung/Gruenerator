/**
 * ts-rest contract router for /api/chat-service/folders
 *
 * OpenWebUI-style folders that group chat threads. Owner-scoped CRUD.
 * Mounted in routes.ts via mountChatThreadFoldersContractRouter(app).
 */

import { chatThreadFoldersContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { createLogger } from '../../utils/logger.js';
import { toIsoString } from '../../utils/toIsoString.js';

import type { UserProfile } from '../../services/user/types.js';
import type { Application, Request } from 'express';

const log = createLogger('chatThreadFoldersContractRouter');

function getUserId(req: Request): string {
  const user = req.user as UserProfile | undefined;
  if (!user?.id) {
    throw new Error('Authentication required (req.user undefined)');
  }
  return user.id;
}

interface FolderRow {
  id: string;
  user_id: string;
  name: string;
  parent_id: string | null;
  sort: number;
  created_at: Date | string;
}

function serialiseFolder(row: FolderRow) {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    parentId: row.parent_id ?? null,
    sort: Number(row.sort ?? 0),
    createdAt: toIsoString(row.created_at),
  };
}

const s = initServer();

export const chatThreadFoldersContractRouter = s.router(chatThreadFoldersContract, {
  list: async (args) => {
    try {
      const userId = getUserId(args.req);
      const postgres = getPostgresInstance();
      const rows = (await postgres.query(
        `SELECT id, user_id, name, parent_id, sort, created_at
         FROM chat_thread_folders
         WHERE user_id = $1 AND COALESCE(is_deleted, FALSE) = FALSE
         ORDER BY sort ASC, created_at ASC`,
        [userId]
      )) as FolderRow[];
      return { status: 200 as const, body: rows.map(serialiseFolder) };
    } catch (error) {
      log.error('Error listing folders:', error);
      return { status: 500 as const, body: { error: 'Failed to list folders' } };
    }
  },

  create: async (args) => {
    try {
      const userId = getUserId(args.req);
      const { name, parentId } = args.body;
      const postgres = getPostgresInstance();
      const rows = (await postgres.query(
        `INSERT INTO chat_thread_folders (user_id, name, parent_id)
         VALUES ($1, $2, $3::uuid)
         RETURNING id, user_id, name, parent_id, sort, created_at`,
        [userId, name, parentId ?? null]
      )) as FolderRow[];
      return { status: 201 as const, body: serialiseFolder(rows[0]) };
    } catch (error) {
      log.error('Error creating folder:', error);
      return { status: 500 as const, body: { error: 'Failed to create folder' } };
    }
  },

  update: async (args) => {
    try {
      const userId = getUserId(args.req);
      const { id } = args.params;
      const { name, parentId, sort } = args.body;
      const postgres = getPostgresInstance();

      const existing = (await postgres.query(
        `SELECT id, user_id FROM chat_thread_folders WHERE id = $1 LIMIT 1`,
        [id]
      )) as Pick<FolderRow, 'id' | 'user_id'>[];
      if (existing.length === 0) {
        return { status: 404 as const, body: { error: 'Folder not found' } };
      }
      if (existing[0].user_id !== userId) {
        return { status: 403 as const, body: { error: 'Forbidden' } };
      }
      if (parentId != null && parentId === id) {
        return {
          status: 400 as const,
          body: { error: 'Ein Ordner kann nicht sich selbst enthalten.' },
        };
      }

      const setClauses: string[] = [];
      const params: unknown[] = [];
      let paramIdx = 1;
      if (name !== undefined) {
        setClauses.push(`name = $${paramIdx}`);
        params.push(name);
        paramIdx++;
      }
      if (parentId !== undefined) {
        setClauses.push(`parent_id = $${paramIdx}::uuid`);
        params.push(parentId);
        paramIdx++;
      }
      if (sort !== undefined) {
        setClauses.push(`sort = $${paramIdx}`);
        params.push(sort);
        paramIdx++;
      }
      if (setClauses.length === 0) {
        return { status: 400 as const, body: { error: 'No fields to update' } };
      }
      params.push(id);

      const rows = (await postgres.query(
        `UPDATE chat_thread_folders SET ${setClauses.join(', ')}
         WHERE id = $${paramIdx}
         RETURNING id, user_id, name, parent_id, sort, created_at`,
        params
      )) as FolderRow[];
      return { status: 200 as const, body: serialiseFolder(rows[0]) };
    } catch (error) {
      log.error('Error updating folder:', error);
      return { status: 500 as const, body: { error: 'Failed to update folder' } };
    }
  },

  delete: async (args) => {
    try {
      const userId = getUserId(args.req);
      const { id } = args.params;
      const postgres = getPostgresInstance();

      const existing = (await postgres.query(
        `SELECT id, user_id FROM chat_thread_folders WHERE id = $1 LIMIT 1`,
        [id]
      )) as Pick<FolderRow, 'id' | 'user_id'>[];
      if (existing.length === 0) {
        return { status: 404 as const, body: { error: 'Folder not found' } };
      }
      if (existing[0].user_id !== userId) {
        return { status: 403 as const, body: { error: 'Forbidden' } };
      }

      // FK ON DELETE SET NULL unfiles the folder's threads (chat history stays).
      await postgres.query(`DELETE FROM chat_thread_folders WHERE id = $1`, [id]);
      return { status: 200 as const, body: { success: true as const } };
    } catch (error) {
      log.error('Error deleting folder:', error);
      return { status: 500 as const, body: { error: 'Failed to delete folder' } };
    }
  },
});

export function mountChatThreadFoldersContractRouter(app: Application): void {
  createExpressEndpoints(chatThreadFoldersContract, chatThreadFoldersContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'chatThreadFoldersContract'),
  });
}
