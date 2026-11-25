/**
 * ts-rest router for the content-sync admin tab: run history and the mail
 * switch that decides whether sync reports still go out by mail.
 *
 * `requireAuth` sits at the prefix `/api/auth/admin/content-sync` (routes.ts);
 * every handler checks `requireInstanceAdmin` itself.
 */
import { adminContentSyncContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import {
  isContentSyncEmailEnabled,
  listContentSyncRuns,
  setContentSyncEmailEnabled,
} from '../../services/scrapers/contentSyncRunLog.js';
import { requireInstanceAdmin } from '../../utils/adminAuthz.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';

import type { Application, Request } from 'express';

const log = createLogger('adminContentSyncContractRouter');

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

export const adminContentSyncContractRouter = s.router(adminContentSyncContract, {
  listRuns: async ({ req, query }) => {
    if (!(await adminId(req))) return FORBIDDEN;
    try {
      return { status: 200 as const, body: { runs: await listContentSyncRuns(query) } };
    } catch (error) {
      log.error('[adminContentSync.listRuns] failed:', error);
      return serverError('Sync-Läufe konnten nicht geladen werden.');
    }
  },

  getSettings: async ({ req }) => {
    if (!(await adminId(req))) return FORBIDDEN;
    return { status: 200 as const, body: { emailEnabled: await isContentSyncEmailEnabled() } };
  },

  updateSettings: async ({ req, body }) => {
    const userId = await adminId(req);
    if (!userId) return FORBIDDEN;
    try {
      const emailEnabled = await setContentSyncEmailEnabled(body.emailEnabled, userId);
      log.info('[adminContentSync.updateSettings]', { adminId: userId, emailEnabled });
      return { status: 200 as const, body: { emailEnabled } };
    } catch (error) {
      log.error('[adminContentSync.updateSettings] failed:', error);
      return serverError('Einstellung konnte nicht gespeichert werden.');
    }
  },
});

export function mountAdminContentSyncContractRouter(app: Application): void {
  createExpressEndpoints(adminContentSyncContract, adminContentSyncContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'adminContentSyncContract'),
  });
}
