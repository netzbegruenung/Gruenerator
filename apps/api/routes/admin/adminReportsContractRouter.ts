/**
 * ts-rest router for the admin reports queue: reports grouped per target,
 * resolve all open reports of a target at once, open count for the tab badge.
 *
 * `requireAuth` sits at the prefix `/api/auth/admin/reports` (routes.ts); every
 * handler checks `requireInstanceAdmin` itself.
 */
import { adminReportsContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import {
  countOpenReportTargets,
  listReportGroups,
  resolveReports,
} from '../../services/contentReports/contentReportsService.js';
import { requireInstanceAdmin } from '../../utils/adminAuthz.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';

import type { Application, Request } from 'express';

const log = createLogger('adminReportsContractRouter');

const FORBIDDEN = {
  status: 403 as const,
  body: { success: false as const, message: 'Keine Admin-Berechtigung.' },
};

const serverError = (message: string) => ({
  status: 500 as const,
  body: { success: false as const, message },
});

const s = initServer();

async function adminId(req: Request): Promise<string | null> {
  const user = getAuthedUser(req);
  return (await requireInstanceAdmin(user.id, user.email)) ? user.id : null;
}

export const adminReportsContractRouter = s.router(adminReportsContract, {
  list: async ({ req, query }) => {
    if (!(await adminId(req))) return FORBIDDEN;
    try {
      return { status: 200 as const, body: { reports: await listReportGroups(query) } };
    } catch (error) {
      log.error('[adminReports.list] failed:', error);
      return serverError('Meldungen konnten nicht geladen werden.');
    }
  },

  resolve: async ({ req, body }) => {
    const userId = await adminId(req);
    if (!userId) return FORBIDDEN;
    try {
      const result = await resolveReports(userId, body);
      if (!result.ok) {
        return {
          status: result.status,
          body: { success: false as const, message: result.message },
        };
      }
      log.info('[adminReports.resolve]', { adminId: userId, ...body, ...result.value });
      return { status: 200 as const, body: result.value };
    } catch (error) {
      log.error('[adminReports.resolve] failed:', error);
      return serverError('Meldungen konnten nicht erledigt werden.');
    }
  },

  stats: async ({ req }) => {
    if (!(await adminId(req))) return FORBIDDEN;
    try {
      return { status: 200 as const, body: { open: await countOpenReportTargets() } };
    } catch (error) {
      log.error('[adminReports.stats] failed:', error);
      return serverError('Meldungen konnten nicht gezählt werden.');
    }
  },
});

export function mountAdminReportsContractRouter(app: Application): void {
  createExpressEndpoints(adminReportsContract, adminReportsContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'adminReportsContract'),
  });
}
