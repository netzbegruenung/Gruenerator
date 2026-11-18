/**
 * ts-rest contract router for /api/auth/antragsgruen-sites — settings →
 * Antragsgrün: list, connect, live access check, forget.
 *
 * requireAuth is applied at the path prefix in routes.ts, so `req.user` is
 * always present; getUserId() throws only as a safety guard.
 */
import { antragsgruenSitesContract } from '@gruenerator/contracts';
import { isIntentAllowedForLocale } from '@gruenerator/shared/chat-intents';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { AntragsgruenFormError } from '../../services/antragsgruen/hosting/formClient.js';
import {
  hostingConfigFromEnv,
  loginRefusalText,
} from '../../services/antragsgruen/hosting/session.js';
import {
  SiteOrderRefused,
  connectAntragsgruenSite,
  forgetHostedSite,
  grueneratorAccessOn,
  hostedSitesOf,
  MAX_SITES_PER_USER,
  type HostedSite,
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

function toApiSite(site: HostedSite) {
  return {
    id: site.id,
    title: site.title,
    url: site.url,
    usersUrl: `${site.url}/admin/users`,
    kind: site.kind,
    createdAt: new Date(site.created_at).toISOString(),
  };
}

function isEnabled(req: Request): boolean {
  return (
    hostingConfigFromEnv() !== null &&
    isIntentAllowedForLocale('antragsgruen', extractLocaleFromRequest(req))
  );
}

const s = initServer();

export const antragsgruenSitesContractRouter = s.router(antragsgruenSitesContract, {
  listSites: async ({ req }) => {
    try {
      const sites = await hostedSitesOf(getUserId(req));
      return {
        status: 200 as const,
        body: {
          enabled: isEnabled(req),
          botAccount: hostingConfigFromEnv()?.botEmail ?? null,
          limit: MAX_SITES_PER_USER,
          sites: sites.map(toApiSite),
        },
      };
    } catch (error) {
      log.error('[listSites] Error:', error);
      return internal;
    }
  },

  connectSite: async ({ req, body }) => {
    if (!isEnabled(req)) {
      return {
        status: 400 as const,
        body: { error: 'Antragsgrün ist hier nicht eingerichtet.' },
      };
    }
    try {
      const site = await connectAntragsgruenSite(getUserId(req), body.url);
      return { status: 201 as const, body: toApiSite(site) };
    } catch (error) {
      if (error instanceof SiteOrderRefused) {
        return { status: 400 as const, body: { error: error.userText } };
      }
      if (
        error instanceof AntragsgruenFormError ||
        (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'TypeError'))
      ) {
        log.warn(`[connectSite] antragsgruen.de failed: ${error.message}`);
        return {
          status: 502 as const,
          body: {
            error:
              loginRefusalText(error) ??
              'antragsgruen.de hat nicht wie erwartet geantwortet. Versuch es später noch einmal.',
          },
        };
      }
      log.error('[connectSite] Error:', error);
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
