/**
 * ts-rest contract router for /api/auth/user-websites.
 *
 * requireAuth is applied at the path prefix in routes.ts, so `req.user` is
 * always present; getUserId() throws only as a safety guard.
 */
import { userWebsitesContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import {
  addUserWebsite,
  deleteUserWebsite,
  DuplicateWebsiteError,
  listUserWebsites,
  refreshUserWebsite,
  WpSourceError,
} from '../../services/user/userWebsiteService.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { createLogger } from '../../utils/logger.js';

import type { UserProfile } from '../../services/user/types.js';
import type { UserWebsiteError } from '@gruenerator/contracts';
import type { Application, Request } from 'express';

const log = createLogger('userWebsitesContractRouter');

function getUserId(req: Request): string {
  const user = req.user as UserProfile | undefined;
  if (!user?.id) throw new Error('Authentication required');
  return user.id;
}

type ErrorResult =
  | { status: 400; body: UserWebsiteError }
  | { status: 422; body: UserWebsiteError }
  | { status: 500; body: UserWebsiteError };

function toErrorResponse(error: unknown): ErrorResult {
  if (error instanceof WpSourceError) {
    const body: UserWebsiteError = { error: error.message, code: error.code };
    return error.code === 'invalid_url'
      ? { status: 400 as const, body }
      : { status: 422 as const, body };
  }
  return { status: 500 as const, body: { error: 'Interner Fehler', code: 'internal' } };
}

const s = initServer();

export const userWebsitesContractRouter = s.router(userWebsitesContract, {
  listWebsites: async (args) => {
    try {
      const websites = await listUserWebsites(getUserId(args.req));
      return { status: 200 as const, body: { success: true as const, websites } };
    } catch (error) {
      log.error('[listWebsites] Error:', error);
      return {
        status: 500 as const,
        body: { error: 'Interner Fehler', code: 'internal' as const },
      };
    }
  },

  addWebsite: async (args) => {
    try {
      const website = await addUserWebsite(getUserId(args.req), args.body.site_url);
      return { status: 200 as const, body: { success: true as const, website } };
    } catch (error) {
      if (error instanceof DuplicateWebsiteError) {
        return {
          status: 409 as const,
          body: { error: error.message, code: 'duplicate' as const },
        };
      }
      if (!(error instanceof WpSourceError)) log.error('[addWebsite] Error:', error);
      return toErrorResponse(error);
    }
  },

  refreshWebsite: async (args) => {
    try {
      const website = await refreshUserWebsite(getUserId(args.req), args.params.id);
      if (!website) {
        return {
          status: 404 as const,
          body: { error: 'Website nicht gefunden', code: 'not_found' as const },
        };
      }
      return { status: 200 as const, body: { success: true as const, website } };
    } catch (error) {
      if (!(error instanceof WpSourceError)) log.error('[refreshWebsite] Error:', error);
      return toErrorResponse(error);
    }
  },

  deleteWebsite: async (args) => {
    try {
      const removed = await deleteUserWebsite(getUserId(args.req), args.params.id);
      if (!removed) {
        return {
          status: 404 as const,
          body: { error: 'Website nicht gefunden', code: 'not_found' as const },
        };
      }
      return { status: 200 as const, body: { success: true as const } };
    } catch (error) {
      log.error('[deleteWebsite] Error:', error);
      return {
        status: 500 as const,
        body: { error: 'Interner Fehler', code: 'internal' as const },
      };
    }
  },
});

/** requireAuth must be applied at the prefix in routes.ts before calling this. */
export function mountUserWebsitesContractRouter(app: Application): void {
  createExpressEndpoints(userWebsitesContract, userWebsitesContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'userWebsitesContract'),
  });
}
