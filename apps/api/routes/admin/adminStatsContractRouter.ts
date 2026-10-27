/**
 * ts-rest contract router for the instance-admin statistics view. Read-only,
 * `requireInstanceAdmin`-gated per handler like instanceAdminOverviewContractRouter —
 * `requireAuth` at the mount prefix in routes.ts covers authentication only.
 * The counting and the suppression live in services/usage/adminContentStats.ts.
 */
import { adminStatsContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { firstDay, getAdminStats, todayInBerlin } from '../../services/usage/adminContentStats.js';
import { requireInstanceAdmin } from '../../utils/adminAuthz.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';

import type { Application } from 'express';

const log = createLogger('adminStatsContractRouter');

const DAY_MS = 24 * 60 * 60 * 1000;

/** Longest window per bucket, in days — beyond that the series stops being readable. */
const MAX_WINDOW_DAYS = { day: 400, week: 5 * 366, month: Number.POSITIVE_INFINITY } as const;

const badRequest = (message: string) => ({
  status: 400 as const,
  body: { success: false as const, message },
});

const s = initServer();

export const adminStatsContractRouter = s.router(adminStatsContract, {
  getStats: async ({ req, query }) => {
    try {
      const authedUser = getAuthedUser(req);
      if (!(await requireInstanceAdmin(authedUser.id, authedUser.email))) {
        return {
          status: 403 as const,
          body: { success: false as const, message: 'Keine Admin-Berechtigung.' },
        };
      }

      const bucket = query.bucket ?? 'month';
      const locale = query.locale ?? 'all';
      // A hidden cell is only safe on one fixed grid — see adminContentStats.ts.
      if (locale !== 'all' && bucket !== 'month') {
        return badRequest('Mit Länderfilter gibt es nur das Monatsraster.');
      }

      const to = query.to ?? todayInBerlin();
      const from = query.from ?? (await firstDay());
      if (from > to) return badRequest('Der Beginn liegt nach dem Ende.');
      const days = (Date.parse(to) - Date.parse(from)) / DAY_MS;
      if (days > MAX_WINDOW_DAYS[bucket]) {
        return badRequest('Zeitraum zu lang für dieses Raster. Bitte gröber wählen.');
      }

      const stats = await getAdminStats({ from, to, bucket, locale });
      return { status: 200 as const, body: stats };
    } catch (error) {
      log.error('[adminStatsContract.getStats] Error:', error);
      return {
        status: 500 as const,
        body: { success: false as const, message: 'Fehler beim Laden der Statistik.' },
      };
    }
  },
});

export function mountAdminStatsContractRouter(app: Application): void {
  createExpressEndpoints(adminStatsContract, adminStatsContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'adminStatsContract'),
  });
}
