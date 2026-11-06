/**
 * ts-rest contract router for the daily briefing (`/api/briefing`, plus the
 * dev-only `/api/dev/briefing/rerun`). Auth sits on both prefixes in routes.ts.
 */
import { briefingContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { env } from '../../config/env.js';
import {
  ensureDailyBriefing,
  markBriefingOpened,
  rerunDailyBriefing,
} from '../../services/briefing/ensureDailyBriefing.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';

import type { Application } from 'express';

const log = createLogger('briefingContractRouter');

const INTERNAL = { message: 'Das Tagesbriefing ist gerade nicht erreichbar.' };
const NOT_FOUND = { message: 'Briefing nicht gefunden.' };

/** Dieselbe Bedingung wie der Dev-Auth-Bypass in `authMiddleware.ts`. */
function devRerunAllowed(): boolean {
  return env.NODE_ENV === 'development' && env.ALLOW_DEV_AUTH_BYPASS === true;
}

const s = initServer();

export const briefingContractRouter = s.router(briefingContract, {
  today: async (args) => {
    try {
      const body = await ensureDailyBriefing(getAuthedUser(args.req).id);
      return { status: 200 as const, body };
    } catch (error) {
      log.error('[briefing.today] Error:', error);
      return { status: 500 as const, body: INTERNAL };
    }
  },

  opened: async (args) => {
    try {
      const found = await markBriefingOpened(getAuthedUser(args.req).id, args.params.threadId);
      if (!found) return { status: 404 as const, body: NOT_FOUND };
      return { status: 200 as const, body: { success: true as const } };
    } catch (error) {
      log.error('[briefing.opened] Error:', error);
      return { status: 500 as const, body: INTERNAL };
    }
  },

  devRerun: async (args) => {
    if (!devRerunAllowed()) return { status: 404 as const, body: NOT_FOUND };
    try {
      const body = await rerunDailyBriefing(getAuthedUser(args.req).id, {
        simulateNextDay: args.body.simulateNextDay === true,
      });
      return { status: 200 as const, body };
    } catch (error) {
      log.error('[briefing.devRerun] Error:', error);
      return { status: 500 as const, body: INTERNAL };
    }
  },
});

export function mountBriefingContractRouter(app: Application): void {
  createExpressEndpoints(briefingContract, briefingContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'briefingContract'),
  });
}
