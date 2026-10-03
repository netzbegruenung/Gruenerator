/**
 * ts-rest router for /api/chat/tool-approvals.
 *
 * Lesen, Widerrufen und die Stufen-Auswahl aus den Konnektor-Einstellungen.
 * Der zweite Schreibweg ist der Fortsetzungspfad eines pausierten Zuges —
 * siehe den Contract.
 */

import { chatToolApprovalsContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';

import {
  grantApproval,
  listApprovals,
  revokeApproval,
} from './services/agenticLoop/toolApprovalRepo.js';

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
            decision: a.decision,
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

  setDecision: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const { scopeKey, toolLabel, decision } = args.body;
      // Zeilen sind per user_id gescoped: ein fremder serverId-Schlüssel legt
      // nur eine tote Zeile bei der eigenen Person an, er erreicht niemanden.
      if (decision === null) await revokeApproval(userId, scopeKey);
      else await grantApproval(userId, scopeKey, toolLabel, decision);
      return { status: 200 as const, body: { scopeKey, decision } };
    } catch (error) {
      log.error('setDecision failed', error);
      return { status: 500 as const, body: { error: (error as Error).message || 'Fehler' } };
    }
  },
});

export function mountToolApprovalsContractRouter(app: Application): void {
  createExpressEndpoints(chatToolApprovalsContract, toolApprovalsContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'chatToolApprovalsContract'),
  });
}
