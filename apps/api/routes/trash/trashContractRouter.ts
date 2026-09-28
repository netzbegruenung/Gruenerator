/**
 * ts-rest contract router for the Papierkorb (`/api/trash`).
 *
 * `requireAuth` is applied at the /api/trash prefix in routes.ts — mount the
 * prefix middleware BEFORE this, because `createExpressEndpoints` binds
 * directly on `app` and would otherwise run without it.
 *
 * Every kind goes through the same registry. Restore and purge-now look the
 * item up with `getTrashed` first, which applies that kind's delete rights.
 */
import { trashContract, type TrashItem, type TrashKind } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import {
  compareTrashKey,
  decodeTrashCursor,
  encodeTrashCursor,
  type TrashCursor,
} from '../../services/trash/trashCursor.js';
import {
  TRASH_KINDS,
  trashHandlerFor,
  type TrashKindHandler,
} from '../../services/trash/trashRegistry.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';

import type { Application } from 'express';

const log = createLogger('trashContract');

const s = initServer();

const DEFAULT_LIMIT = 50;
const EMPTY_BATCH = 100;

const NOT_FOUND = { status: 404 as const, body: { error: 'Nicht im Papierkorb gefunden.' } };
const FORBIDDEN = {
  status: 403 as const,
  body: { error: 'Nur wer löschen darf, kann wiederherstellen oder endgültig löschen.' },
};
const CONFLICT = {
  status: 409 as const,
  body: { error: 'Ein Eintrag mit demselben Namen existiert bereits. Bitte zuerst umbenennen.' },
};

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === '23505';
}

/** The handlers a request covers: one kind, or every registered one. */
function handlersFor(kind: TrashKind | undefined): TrashKindHandler[] | null {
  if (!kind) return Object.values(TRASH_KINDS);
  const handler = trashHandlerFor(kind);
  return handler ? [handler] : null;
}

/**
 * Each handler returns at most `limit + 1` rows after the cursor; the merged
 * page is the first `limit` of their union under the shared key, and there is
 * another page exactly when the union held more.
 */
async function listPage(
  handlers: TrashKindHandler[],
  userId: string,
  limit: number,
  before: TrashCursor | null
): Promise<{ items: TrashItem[]; nextCursor: string | null }> {
  const pages = await Promise.all(
    handlers.map((h) => h.listTrashed(userId, { limit: limit + 1, before }))
  );
  const merged = pages.flat().sort(compareTrashKey);
  const items = merged.slice(0, limit);
  const last = items[items.length - 1];
  const nextCursor =
    merged.length > limit && last
      ? encodeTrashCursor({ deletedAt: last.deletedAt, id: last.id })
      : null;
  return { items, nextCursor };
}

async function emptyTrash(handlers: TrashKindHandler[], userId: string): Promise<number> {
  let purged = 0;
  for (const handler of handlers) {
    let before: TrashCursor | null = null;
    for (;;) {
      const batch = await handler.listTrashed(userId, { limit: EMPTY_BATCH, before });
      for (const item of batch) {
        if (await handler.purge(item.id, null)) purged++;
      }
      const last = batch[batch.length - 1];
      if (batch.length < EMPTY_BATCH || !last) break;
      before = { deletedAt: last.deletedAt, id: last.id };
    }
  }
  return purged;
}

export const trashContractRouter = s.router(trashContract, {
  list: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const handlers = handlersFor(args.query.kind);
      if (!handlers) return NOT_FOUND;
      const before = args.query.cursor ? decodeTrashCursor(args.query.cursor) : null;
      if (args.query.cursor && !before) {
        return { status: 400 as const, body: { error: 'Ungültiger Cursor.' } };
      }
      const page = await listPage(handlers, userId, args.query.limit ?? DEFAULT_LIMIT, before);
      return { status: 200 as const, body: page };
    } catch (error) {
      log.error('[trashContract.list] Error:', error);
      return { status: 500 as const, body: { error: 'Papierkorb konnte nicht geladen werden.' } };
    }
  },

  restore: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const handler = trashHandlerFor(args.params.kind);
      if (!handler) return NOT_FOUND;
      const item = await handler.getTrashed(userId, args.params.id);
      if (item === 'not_found') return NOT_FOUND;
      if (item === 'forbidden') return FORBIDDEN;

      const result = await handler.restore(userId, args.params.id);
      if (result === 'not_found') return NOT_FOUND;
      if (result === 'forbidden') return FORBIDDEN;
      if (result === 'conflict') return CONFLICT;
      return { status: 200 as const, body: item };
    } catch (error) {
      if (isUniqueViolation(error)) return CONFLICT;
      log.error('[trashContract.restore] Error:', error);
      return { status: 500 as const, body: { error: 'Wiederherstellen fehlgeschlagen.' } };
    }
  },

  purge: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const handler = trashHandlerFor(args.params.kind);
      if (!handler) return NOT_FOUND;
      const item = await handler.getTrashed(userId, args.params.id);
      if (item === 'not_found') return NOT_FOUND;
      if (item === 'forbidden') return FORBIDDEN;

      const purged = await handler.purge(item.id, null);
      return { status: 200 as const, body: { purged: purged ? 1 : 0 } };
    } catch (error) {
      log.error('[trashContract.purge] Error:', error);
      return { status: 500 as const, body: { error: 'Endgültiges Löschen fehlgeschlagen.' } };
    }
  },

  empty: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const handlers = handlersFor(args.query.kind);
      if (!handlers) return NOT_FOUND;
      return { status: 200 as const, body: { purged: await emptyTrash(handlers, userId) } };
    } catch (error) {
      log.error('[trashContract.empty] Error:', error);
      return { status: 500 as const, body: { error: 'Papierkorb konnte nicht geleert werden.' } };
    }
  },
});

export function mountTrashContractRouter(app: Application): void {
  createExpressEndpoints(trashContract, trashContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'trashContract'),
  });
}
