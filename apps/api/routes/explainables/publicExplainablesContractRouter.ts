/**
 * ts-rest router for opening an explainable by share token. Mounted BEFORE
 * the requireAuth gate with optionalAuth, so `req.user` may be absent.
 */
import { publicExplainablesContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import {
  getExplainableByShareToken,
  toExplainableDto,
} from '../../services/explainables/explainableRepository.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { createLogger } from '../../utils/logger.js';

import { canRead } from './explainableAccess.js';

import type { UserProfile } from '../../services/user/types.js';
import type { Application, Request } from 'express';

const log = createLogger('publicExplainablesContract');
const s = initServer();

export function viewerId(req: Request): string | null {
  return (req.user as UserProfile | undefined)?.id ?? null;
}

export const publicExplainablesContractRouter = s.router(publicExplainablesContract, {
  getShared: async ({ req, params }) => {
    const row = await getExplainableByShareToken(params.token);
    const access = canRead(row, viewerId(req));
    if (!row || access === 'not_found') {
      return { status: 404 as const, body: { error: 'Explainable nicht gefunden.' } };
    }
    if (access === 'login_required') {
      return {
        status: 401 as const,
        body: {
          error: 'Bitte melde dich an, um diese Erklärung zu sehen.',
          share_mode: 'authenticated' as const,
        },
      };
    }
    return { status: 200 as const, body: toExplainableDto(row, access === 'owner') };
  },
});

export function mountPublicExplainablesContractRouter(app: Application): void {
  createExpressEndpoints(publicExplainablesContract, publicExplainablesContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'publicExplainablesContract'),
  });
}
