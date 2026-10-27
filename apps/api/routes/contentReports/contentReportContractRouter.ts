/**
 * ts-rest contract router for reporting objectionable content.
 *
 * POST /api/content-reports → stores the report (content_reports, idempotent
 * per reporter and target; may auto-hide a moderatable target) and emails it to the
 * operator. The row is the record: a failed mail is logged, not returned. Auth
 * is applied at the prefix in routes.ts, so `req.user` is populated here.
 */

import { contentReportContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';
import { type Application } from 'express';

import { recordContentReport } from '../../services/contentReports/contentReportsService.js';
import { isEmailConfigured, sendEmail } from '../../services/email/index.js';
import { baseLayout, escapeHtml } from '../../services/email/templates.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('contentReportContractRouter');

const REPORT_RECIPIENT = 'info@moritz-waechter.de';

const s = initServer();

export const contentReportContractRouter = s.router(contentReportContract, {
  create: async (args) => {
    try {
      const user = getAuthedUser(args.req);
      const { kind, reason, note, targetId, groupId, threadId, excerpt } = args.body;

      const recorded = await recordContentReport(user.id, args.body);
      if (!recorded.ok) {
        return {
          status: recorded.status,
          body: { success: false as const, error: recorded.message },
        };
      }
      const { stored, hidden } = recorded.value;

      if (!stored) {
        log.info('[ContentReport] Duplicate report ignored', { userId: user.id, kind, targetId });
        return { status: 200 as const, body: { success: true as const } };
      }
      if (!isEmailConfigured()) {
        log.warn('[ContentReport] Stored without mail: SMTP not configured', { kind, targetId });
        return { status: 200 as const, body: { success: true as const } };
      }

      const rows: Array<[string, string]> = [
        ['Art', kind],
        ['Grund', reason],
        ['Ziel-ID', targetId],
        ['Projekt-ID', groupId ?? '—'],
        ['Thread-ID', threadId ?? '—'],
        ['Gemeldet von', `${user.id}${user.email ? ` (${user.email})` : ''}`],
        ['Zeitpunkt', new Date().toISOString()],
        ...(hidden ? [['Status', 'Automatisch ausgeblendet'] as [string, string]] : []),
      ];

      const tableRows = rows
        .map(
          ([k, v]) =>
            `<tr><td style="padding:4px 12px 4px 0;color:#555;vertical-align:top;white-space:nowrap;">${escapeHtml(
              k
            )}</td><td style="padding:4px 0;">${escapeHtml(v)}</td></tr>`
        )
        .join('');

      const noteHtml = note
        ? `<div style="white-space:pre-wrap;padding:12px 16px;background:#f5f5f5;border-radius:8px;margin-bottom:20px;color:#111;">${escapeHtml(
            note
          )}</div>`
        : '';

      const excerptHtml = excerpt
        ? `<div style="white-space:pre-wrap;padding:12px 16px;border:1px solid #ddd;border-radius:8px;margin-bottom:20px;color:#111;">${escapeHtml(
            excerpt
          )}</div>`
        : '';

      const html = baseLayout(`
        <h2 style="margin:0 0 12px;font-size:20px;color:#111;">Inhalt gemeldet</h2>
        ${noteHtml}
        ${excerptHtml}
        <table style="border-collapse:collapse;font-size:14px;color:#111;">${tableRows}</table>`);

      const text = [
        'Inhalt gemeldet',
        '',
        ...(note ? [note, ''] : []),
        ...(excerpt ? ['Gemeldeter Inhalt:', excerpt, ''] : []),
        ...rows.map(([k, v]) => `${k}: ${v}`),
      ].join('\n');

      const sent = await sendEmail({
        to: REPORT_RECIPIENT,
        subject: `Grünerator Meldung – ${kind} (${reason})`,
        html,
        text,
      }).catch((error: unknown) => {
        log.error('[ContentReport] Mail failed after the report was stored:', error);
        return false;
      });

      log.info('[ContentReport] Submit attempted', { userId: user.id, kind, reason, sent, hidden });

      return { status: 200 as const, body: { success: true as const } };
    } catch (error) {
      log.error('[contentReportContract.create] Error:', error);
      return {
        status: 500 as const,
        body: { success: false as const, error: 'Report could not be sent' },
      };
    }
  },
});

export function mountContentReportContractRouter(app: Application): void {
  createExpressEndpoints(contentReportContract, contentReportContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'contentReportContract'),
  });
}
