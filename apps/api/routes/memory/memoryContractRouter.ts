/**
 * ts-rest contract router for the person's explicit memory (`/api/memory`).
 *
 * Six routes: list, export, create, update, remove, removeAll. The user is
 * always the authenticated one; auth and the mutation limiter sit on the
 * prefix in routes.ts because createExpressEndpoints registers the handlers
 * straight on `app`.
 */
import { memoryContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { memoryService, MemoryRejectedError } from '../../services/memory/index.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { setContentDisposition } from '../../utils/http/contentDisposition.js';
import { createLogger } from '../../utils/logger.js';
import { toIsoString } from '../../utils/toIsoString.js';

import type { UserMemoryRow } from '../../database/schema/index.js';
import type { UserMemory } from '@gruenerator/contracts';
import type { Application } from 'express';

const log = createLogger('memoryContractRouter');

function toWire(row: UserMemoryRow): UserMemory {
  return {
    id: row.id,
    kind: row.kind,
    text: row.text,
    source: row.source,
    created_at: toIsoString(row.created_at),
    updated_at: toIsoString(row.updated_at),
  };
}

const INTERNAL = { message: 'Das Gedächtnis ist gerade nicht erreichbar.' };
const NOT_FOUND = { message: 'Erinnerung nicht gefunden.' };

const s = initServer();

export const memoryContractRouter = s.router(memoryContract, {
  list: async (args) => {
    try {
      const rows = await memoryService.list(getAuthedUser(args.req).id);
      return { status: 200 as const, body: { memories: rows.map(toWire) } };
    } catch (error) {
      log.error('[memoryContract.list] Error:', error);
      return { status: 500 as const, body: INTERNAL };
    }
  },

  export: async (args) => {
    try {
      const rows = await memoryService.list(getAuthedUser(args.req).id);
      const filename = `gruenerator-erinnerungen-${new Date().toISOString().slice(0, 10)}.json`;
      setContentDisposition(args.res, filename);
      return {
        status: 200 as const,
        body: {
          exportedAt: new Date().toISOString(),
          memoryCount: rows.length,
          memories: rows.map(toWire),
        },
      };
    } catch (error) {
      log.error('[memoryContract.export] Error:', error);
      return { status: 500 as const, body: INTERNAL };
    }
  },

  create: async (args) => {
    try {
      const { row, duplicate } = await memoryService.create({
        userId: getAuthedUser(args.req).id,
        kind: args.body.kind,
        text: args.body.text,
        source: 'manual',
        threadId: null,
      });
      return { status: 200 as const, body: { memory: toWire(row), duplicate } };
    } catch (error) {
      if (error instanceof MemoryRejectedError) {
        return { status: 400 as const, body: { message: error.userMessage } };
      }
      log.error('[memoryContract.create] Error:', error);
      return { status: 500 as const, body: INTERNAL };
    }
  },

  update: async (args) => {
    try {
      const row = await memoryService.update(
        getAuthedUser(args.req).id,
        args.params.id,
        args.body.text
      );
      if (!row) return { status: 404 as const, body: NOT_FOUND };
      return { status: 200 as const, body: { memory: toWire(row), duplicate: false } };
    } catch (error) {
      if (error instanceof MemoryRejectedError) {
        return { status: 400 as const, body: { message: error.userMessage } };
      }
      log.error('[memoryContract.update] Error:', error);
      return { status: 500 as const, body: INTERNAL };
    }
  },

  remove: async (args) => {
    try {
      const row = await memoryService.remove(getAuthedUser(args.req).id, args.params.id);
      if (!row) return { status: 404 as const, body: NOT_FOUND };
      return { status: 200 as const, body: { success: true as const } };
    } catch (error) {
      log.error('[memoryContract.remove] Error:', error);
      return { status: 500 as const, body: INTERNAL };
    }
  },

  removeAll: async (args) => {
    try {
      await memoryService.removeAll(getAuthedUser(args.req).id);
      return { status: 200 as const, body: { success: true as const } };
    } catch (error) {
      log.error('[memoryContract.removeAll] Error:', error);
      return { status: 500 as const, body: INTERNAL };
    }
  },
});

export function mountMemoryContractRouter(app: Application): void {
  createExpressEndpoints(memoryContract, memoryContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'memoryContract'),
  });
}
