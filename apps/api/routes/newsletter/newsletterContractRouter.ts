/**
 * ts-rest router for POST /api/newsletter/subscribe.
 *
 * One-click double opt-in with the signed-in person's account address. Auth and
 * the per-user rate limit are applied at the prefix in routes.ts.
 */

import { newsletterContract, type NewsletterErrorCode } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { APP_BASE_URL } from '../../config/mcpServer.js';
import { subscribeToNewsletter } from '../../services/newsletter/brevoNewsletter.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';

import type { Application } from 'express';

const log = createLogger('newsletterContract');

/** After the confirmation click the person lands back on the Arbeiten tab. */
const REDIRECTION_URL = `${APP_BASE_URL}/start/arbeiten?newsletter=bestaetigt`;

const MESSAGES: Record<Exclude<NewsletterErrorCode, 'internal'>, string> = {
  no_email: 'Zu deinem Konto ist keine E-Mail-Adresse hinterlegt.',
  not_configured: 'Die Newsletter-Anmeldung ist auf dieser Instanz nicht eingerichtet.',
  brevo_failed:
    'Die Bestätigungs-Mail konnte nicht verschickt werden. Bitte versuche es später erneut.',
};

const s = initServer();

export const newsletterContractRouter = s.router(newsletterContract, {
  subscribe: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const result = await subscribeToNewsletter(userId, REDIRECTION_URL, args.body?.email);

      if (result.status === 'already_subscribed') {
        return { status: 200 as const, body: { status: 'already_subscribed' as const } };
      }
      if (result.status === 'confirmation_sent') {
        return { status: 202 as const, body: { status: 'confirmation_sent' as const } };
      }

      const body = { code: result.code, error: MESSAGES[result.code] };
      if (result.code === 'no_email') return { status: 422 as const, body };
      if (result.code === 'not_configured') return { status: 503 as const, body };
      return { status: 502 as const, body };
    } catch (error) {
      log.error('[Newsletter Contract] subscribe failed:', error);
      return {
        status: 500 as const,
        body: { code: 'internal' as const, error: 'Die Anmeldung ist gerade nicht möglich.' },
      };
    }
  },
});

export function mountNewsletterContractRouter(app: Application): void {
  createExpressEndpoints(newsletterContract, newsletterContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'newsletterContract'),
  });
}
