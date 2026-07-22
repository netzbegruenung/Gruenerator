/**
 * ts-rest contract router for the in-app feedback widget.
 *
 * POST /api/feedback → emails the reported feedback to the operator, with the
 * client-collected page context and an optional page screenshot attached.
 *
 * Uses the low-level `sendEmail` (not `sendNotificationEmail`) because we need
 * a fixed recipient plus an image attachment. Auth is applied at the
 * /api/feedback prefix in routes.ts, so `req.user` is populated here.
 */

import { feedbackContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';
import { type Application } from 'express';

import { isEmailConfigured, sendEmail } from '../../services/email/index.js';
import { baseLayout, escapeHtml } from '../../services/email/templates.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('feedbackContractRouter');

const FEEDBACK_RECIPIENT = 'info@moritz-waechter.de';

const s = initServer();

export const feedbackContractRouter = s.router(feedbackContract, {
  submit: async (args) => {
    try {
      const user = getAuthedUser(args.req);
      const { message, feature, pageContext, screenshot } = args.body;

      if (!isEmailConfigured()) {
        return {
          status: 503 as const,
          body: { success: false as const, error: 'SMTP not configured on this server' },
        };
      }

      const userLabel = user.display_name ?? user.username ?? user.email ?? user.id;
      const rows: Array<[string, string]> = [
        ['Von', `${userLabel}${user.email ? ` (${user.email})` : ''}`],
        ['User-ID', user.id],
        ...(feature ? ([['Bereich', feature]] as Array<[string, string]>) : []),
        [
          'Seite',
          pageContext.routeName ? `${pageContext.routeName} — ${pageContext.url}` : pageContext.url,
        ],
        ['Pfad', pageContext.pathname],
        ['Viewport', `${pageContext.viewport.width}×${pageContext.viewport.height}`],
        ['Sprache', pageContext.locale ?? '—'],
        ['App-Version', pageContext.appVersion ?? '—'],
        ['Browser', pageContext.userAgent],
      ];

      const tableRows = rows
        .map(
          ([k, v]) =>
            `<tr><td style="padding:4px 12px 4px 0;color:#555;vertical-align:top;white-space:nowrap;">${escapeHtml(
              k
            )}</td><td style="padding:4px 0;">${escapeHtml(v)}</td></tr>`
        )
        .join('');

      const html = baseLayout(`
        <h2 style="margin:0 0 12px;font-size:20px;color:#111;">Neues Feedback</h2>
        <div style="white-space:pre-wrap;padding:12px 16px;background:#f5f5f5;border-radius:8px;margin-bottom:20px;color:#111;">${escapeHtml(
          message
        )}</div>
        <table style="border-collapse:collapse;font-size:14px;color:#111;">${tableRows}</table>`);

      const textLines = ['Neues Feedback', '', message, '', ...rows.map(([k, v]) => `${k}: ${v}`)];

      let attachments:
        | Array<{ filename: string; content: Buffer; contentType: string }>
        | undefined;
      if (screenshot) {
        const match = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/s.exec(screenshot);
        if (match) {
          const contentType = match[1];
          const ext = contentType.split('/')[1]?.split('+')[0] ?? 'png';
          attachments = [
            {
              filename: `screenshot.${ext}`,
              content: Buffer.from(match[2], 'base64'),
              contentType,
            },
          ];
        } else {
          log.warn('[Feedback] Ignoring malformed screenshot data URL', { userId: user.id });
        }
      }

      // Use the pathname (always page-specific) for the subject; routeName is
      // the browser tab title and is often the generic brand name.
      const subjectPage = pageContext.pathname;
      const sent = await sendEmail({
        to: FEEDBACK_RECIPIENT,
        subject: `Grünerator Feedback – ${subjectPage}`,
        html,
        text: textLines.join('\n'),
        ...(attachments && { attachments }),
      });

      log.info('[Feedback] Submit attempted', {
        userId: user.id,
        sent,
        hasScreenshot: !!attachments,
      });

      if (!sent) {
        return {
          status: 502 as const,
          body: { success: false as const, error: 'SMTP send failed — check server logs' },
        };
      }

      return { status: 200 as const, body: { success: true } };
    } catch (error) {
      log.error('[feedbackContract.submit] Error:', error);
      const errMessage = error instanceof Error ? error.message : String(error);
      return { status: 500 as const, body: { success: false as const, error: errMessage } };
    }
  },
});

export function mountFeedbackContractRouter(app: Application): void {
  createExpressEndpoints(feedbackContract, feedbackContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'feedbackContract'),
  });
}
