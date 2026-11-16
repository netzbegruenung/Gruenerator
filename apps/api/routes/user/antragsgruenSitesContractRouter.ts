/**
 * ts-rest contract router for /api/auth/antragsgruen-sites — settings →
 * Konnektoren → Antragsgrün.
 *
 * requireAuth is applied at the path prefix in routes.ts, so `req.user` is
 * always present; getUserId() throws only as a safety guard.
 */
import { antragsgruenSitesContract } from '@gruenerator/contracts';
import { isIntentAllowedForLocale } from '@gruenerator/shared/chat-intents';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { hostingConfigFromEnv } from '../../services/antragsgruen/hosting/session.js';
import {
  forgetHostedSite,
  grueneratorAccessOn,
  hostedSitesOf,
  MAX_SITES_PER_USER,
} from '../../services/antragsgruen/hosting/sites.js';
import { extractLocaleFromRequest } from '../../services/localization/index.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { createLogger } from '../../utils/logger.js';

import type { UserProfile } from '../../services/user/types.js';
import type { Application, Request } from 'express';

const log = createLogger('antragsgruenSitesContractRouter');

function getUserId(req: Request): string {
  const user = req.user as UserProfile | undefined;
  if (!user?.id) throw new Error('Authentication required');
  return user.id;
}

const internal = { status: 500 as const, body: { error: 'Interner Fehler' } };

const s = initServer();

export const antragsgruenSitesContractRouter = s.router(antragsgruenSitesContract, {
  listSites: async ({ req }) => {
    try {
      const config = hostingConfigFromEnv();
      const sites = await hostedSitesOf(getUserId(req));
      return {
        status: 200 as const,
        body: {
          enabled:
            config !== null &&
            isIntentAllowedForLocale('antragsgruen', extractLocaleFromRequest(req)),
          botAccount: config?.botEmail ?? null,
          limit: MAX_SITES_PER_USER,
          sites: sites.map((site) => ({
            id: site.id,
            title: site.title,
            url: site.url,
            usersUrl: `${site.url}/admin/users`,
            createdAt: new Date(site.created_at).toISOString(),
          })),
        },
      };
    } catch (error) {
      log.error('[listSites] Error:', error);
      return internal;
    }
  },

  siteAccess: async ({ req }) => {
    try {
      return { status: 200 as const, body: { access: await grueneratorAccessOn(getUserId(req)) } };
    } catch (error) {
      log.error('[siteAccess] Error:', error);
      return internal;
    }
  },

  forgetSite: async ({ req, params }) => {
    try {
      if (!(await forgetHostedSite(getUserId(req), params.id))) {
        return { status: 404 as const, body: { error: 'Seite nicht gefunden' } };
      }
      return { status: 200 as const, body: { success: true as const } };
    } catch (error) {
      log.error('[forgetSite] Error:', error);
      return internal;
    }
  },
});

/** requireAuth must be applied at the prefix in routes.ts before calling this. */
export function mountAntragsgruenSitesContractRouter(app: Application): void {
  createExpressEndpoints(antragsgruenSitesContract, antragsgruenSitesContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'antragsgruenSitesContract'),
  });
}
