/**
 * ts-rest contract router for reporting objectionable content.
 *
 * POST /api/content-reports → emails the report (kind, reason, note, target ids,
 * reporter) to the operator. No DB row. Auth is applied at the prefix in
 * routes.ts, so `req.user` is populated here.
 */

import { contentReportContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';
import { type Application } from 'express';

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
      const { kind, reason, note, targetId, groupId, threadId } = args.body;

      if (!isEmailConfigured()) {
        return {
          status: 500 as const,
          body: { success: false as const, error: 'SMTP not configured on this server' },
        };
      }

      const rows: Array<[string, string]> = [
        ['Art', kind],
        ['Grund', reason],
        ['Ziel-ID', targetId],
        ['Projekt-ID', groupId ?? '—'],
        ['Thread-ID', threadId ?? '—'],
        ['Gemeldet von', `${user.id}${user.email ? ` (${user.email})` : ''}`],
        ['Zeitpunkt', new Date().toISOString()],
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

      const html = baseLayout(`
        <h2 style="margin:0 0 12px;font-size:20px;color:#111;">Inhalt gemeldet</h2>
        ${noteHtml}
        <table style="border-collapse:collapse;font-size:14px;color:#111;">${tableRows}</table>`);

      const text = [
        'Inhalt gemeldet',
        '',
        ...(note ? [note, ''] : []),
        ...rows.map(([k, v]) => `${k}: ${v}`),
      ].join('\n');

      const sent = await sendEmail({
        to: REPORT_RECIPIENT,
        subject: `Grünerator Meldung – ${kind} (${reason})`,
        html,
        text,
      });

      log.info('[ContentReport] Submit attempted', { userId: user.id, kind, reason, sent });

      if (!sent) {
        return {
          status: 500 as const,
          body: { success: false as const, error: 'SMTP send failed — check server logs' },
        };
      }

      return { status: 200 as const, body: { success: true as const } };
    } catch (error) {
      log.error('[contentReportContract.create] Error:', error);
      const errMessage = error instanceof Error ? error.message : String(error);
      return { status: 500 as const, body: { success: false as const, error: errMessage } };
    }
  },
});

export function mountContentReportContractRouter(app: Application): void {
  createExpressEndpoints(contentReportContract, contentReportContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'contentReportContract'),
  });
}
