/**
 * ts-rest contract router for user-facing email endpoints.
 *
 * Currently mounts:
 *   - POST /api/email/test  → send a test email to the authenticated user
 *
 * The richer /api/email/send-content endpoint stays on the legacy router for
 * now (multipart-adjacent attachment handling that's awkward to express in
 * ts-rest without a multipart contract helper). Migrate when needed.
 *
 * Auth is applied at the /api/email prefix in routes.ts before this mounts,
 * so handlers can assume `req.user` is populated.
 */

import { emailContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { isEmailConfigured, sendNotificationEmail } from '../../services/email/index.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';

import type { Application } from 'express';

const log = createLogger('emailContractRouter');

const s = initServer();

export const emailContractRouter = s.router(emailContract, {
  test: async (args) => {
    try {
      const user = getAuthedUser(args.req);
      const recipientEmail = user.email;

      if (!recipientEmail) {
        return {
          status: 400 as const,
          body: {
            success: false as const,
            configured: isEmailConfigured(),
            error: 'No email address on profile',
          },
        };
      }

      const configured = isEmailConfigured();
      if (!configured) {
        return {
          status: 503 as const,
          body: {
            success: false as const,
            configured: false,
            error: 'SMTP not configured on this server',
          },
        };
      }

      const sent = await sendNotificationEmail({
        recipientEmail,
        ...(user.display_name != null && { recipientName: user.display_name }),
        title: 'Grünerator – Test-E-Mail',
        body: 'Diese Test-E-Mail bestätigt, dass dein Account E-Mail-Benachrichtigungen empfangen kann. Wenn du sie siehst, funktioniert die Zustellung.',
        actionUrl: null,
      });

      log.info('[Email] Test email attempted', { userId: user.id, recipientEmail, sent });

      if (!sent) {
        return {
          status: 502 as const,
          body: {
            success: false as const,
            configured: true,
            error: 'SMTP send failed — check server logs',
          },
        };
      }

      return {
        status: 200 as const,
        body: { success: true, configured: true, recipientEmail },
      };
    } catch (error) {
      log.error('[emailContract.test] Error:', error);
      const message = error instanceof Error ? error.message : String(error);
      return {
        status: 500 as const,
        body: { success: false as const, error: message },
      };
    }
  },
});

export function mountEmailContractRouter(app: Application): void {
  createExpressEndpoints(emailContract, emailContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'emailContract'),
  });
}
