/**
 * ts-rest contract router for /api/auth/letterheads.
 *
 * requireAuth is applied at the path prefix in routes.ts, so `req.user` is
 * always present; getUserId() throws only as a safety guard. Every repository
 * call is scoped by that user id — a letterhead ends up on Grünen
 * corporate-identity paper, so a guessed id must not reach someone else's.
 */
import { letterheadsContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import {
  createLetterhead,
  deleteLetterhead,
  getLetterhead,
  listLetterheads,
  updateLetterhead,
} from '../../services/user/letterheadRepository.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { createLogger } from '../../utils/logger.js';

import type { UserLetterheadRow } from '../../database/schema/userLetterheads.js';
import type { UserProfile } from '../../services/user/types.js';
import type { Application, Request } from 'express';

const log = createLogger('letterheadsContractRouter');

function getUserId(req: Request): string {
  const user = req.user as UserProfile | undefined;
  if (!user?.id) throw new Error('Authentication required');
  return user.id;
}

function toResponse(row: UserLetterheadRow) {
  return {
    id: row.id,
    label: row.label,
    organization: row.organization,
    address: row.address,
    is_default: row.is_default,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** Postgres unique-violation — the per-user label index. */
function isDuplicateLabel(error: unknown): boolean {
  return (error as { code?: string })?.code === '23505';
}

const s = initServer();

export const letterheadsContractRouter = s.router(letterheadsContract, {
  listLetterheads: async (args) => {
    try {
      const rows = await listLetterheads(getUserId(args.req));
      return { status: 200 as const, body: { letterheads: rows.map(toResponse) } };
    } catch (error) {
      log.error('[listLetterheads] Error:', error);
      return {
        status: 500 as const,
        body: { success: false as const, message: 'Briefköpfe konnten nicht geladen werden.' },
      };
    }
  },

  createLetterhead: async (args) => {
    try {
      const row = await createLetterhead(getUserId(args.req), args.body);
      return { status: 201 as const, body: { letterhead: toResponse(row) } };
    } catch (error) {
      if (isDuplicateLabel(error)) {
        return {
          status: 409 as const,
          body: {
            success: false as const,
            message: 'Ein Briefkopf mit diesem Namen existiert bereits.',
          },
        };
      }
      log.error('[createLetterhead] Error:', error);
      return {
        status: 500 as const,
        body: { success: false as const, message: 'Briefkopf konnte nicht angelegt werden.' },
      };
    }
  },

  updateLetterhead: async (args) => {
    try {
      const userId = getUserId(args.req);
      const row = await updateLetterhead(userId, args.params.id, args.body);
      if (!row) {
        return {
          status: 404 as const,
          body: { success: false as const, message: 'Briefkopf nicht gefunden.' },
        };
      }
      return { status: 200 as const, body: { letterhead: toResponse(row) } };
    } catch (error) {
      if (isDuplicateLabel(error)) {
        return {
          status: 409 as const,
          body: {
            success: false as const,
            message: 'Ein Briefkopf mit diesem Namen existiert bereits.',
          },
        };
      }
      log.error('[updateLetterhead] Error:', error);
      return {
        status: 500 as const,
        body: { success: false as const, message: 'Briefkopf konnte nicht gespeichert werden.' },
      };
    }
  },

  deleteLetterhead: async (args) => {
    try {
      const userId = getUserId(args.req);
      const existing = await getLetterhead(userId, args.params.id);
      if (!existing) {
        return {
          status: 404 as const,
          body: { success: false as const, message: 'Briefkopf nicht gefunden.' },
        };
      }
      await deleteLetterhead(userId, args.params.id);
      return { status: 200 as const, body: { success: true as const } };
    } catch (error) {
      log.error('[deleteLetterhead] Error:', error);
      return {
        status: 500 as const,
        body: { success: false as const, message: 'Briefkopf konnte nicht gelöscht werden.' },
      };
    }
  },
});

export function mountLetterheadsContractRouter(app: Application): void {
  createExpressEndpoints(letterheadsContract, letterheadsContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'letterheadsContract'),
  });
}
