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

import { isEmailConfigured, sendEmail } from '../../services/email/index.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';

import type { Application } from 'express';

const log = createLogger('feedbackContractRouter');

const FEEDBACK_RECIPIENT = 'info@moritz-waechter.de';

const s = initServer();

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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

      const html = `
        <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#111;max-width:640px;">
          <h2 style="margin:0 0 12px;">Neues Feedback</h2>
          <div style="white-space:pre-wrap;padding:12px 16px;background:#f5f5f5;border-radius:8px;margin-bottom:20px;">${escapeHtml(
            message
          )}</div>
          <table style="border-collapse:collapse;font-size:14px;">${tableRows}</table>
        </div>`;

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

      const subjectPage = pageContext.routeName ?? pageContext.pathname;
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
