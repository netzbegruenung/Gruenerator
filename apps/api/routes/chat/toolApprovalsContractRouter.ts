/**
 * ts-rest router for /api/chat/tool-approvals.
 *
 * Lesen und Widerrufen der dauerhaften Werkzeug-Freigaben. Erteilt werden sie
 * nur im Fortsetzungspfad eines pausierten Zuges — siehe den Contract.
 */

import { chatToolApprovalsContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';

import { listApprovals, revokeApproval } from './services/agenticLoop/toolApprovalRepo.js';

import type { Application } from 'express';

const log = createLogger('toolApprovalsContract');

const s = initServer();

export const toolApprovalsContractRouter = s.router(chatToolApprovalsContract, {
  list: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const approvals = await listApprovals(userId);
      return {
        status: 200 as const,
        body: {
          approvals: approvals.map((a) => ({
            scopeKey: a.scopeKey,
            toolLabel: a.toolLabel,
            createdAt: a.createdAt.toISOString(),
          })),
        },
      };
    } catch (error) {
      log.error('list failed', error);
      return { status: 500 as const, body: { error: (error as Error).message || 'Fehler' } };
    }
  },

  revoke: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const revoked = await revokeApproval(userId, args.body.scopeKey);
      return { status: 200 as const, body: { revoked } };
    } catch (error) {
      log.error('revoke failed', error);
      return { status: 500 as const, body: { error: (error as Error).message || 'Fehler' } };
    }
  },
});

export function mountToolApprovalsContractRouter(app: Application): void {
  createExpressEndpoints(chatToolApprovalsContract, toolApprovalsContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'chatToolApprovalsContract'),
  });
}
