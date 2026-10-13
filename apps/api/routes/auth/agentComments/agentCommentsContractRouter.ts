/**
 * ts-rest contract router for agent comments (/api/auth/agent-comments).
 * requireAuth is applied at the prefix in routes.ts; access rules live in
 * `services/agentComments/agentCommentsService.ts`.
 */
import { agentCommentsContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import {
  createAgentComment,
  deleteAgentComment,
  listAgentComments,
  type AgentCommentOutcome,
} from '../../../services/agentComments/agentCommentsService.js';
import { logContractValidationError } from '../../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../../utils/getAuthedUser.js';
import { createLogger } from '../../../utils/logger.js';

import type { Application } from 'express';

const log = createLogger('agentCommentsContractRouter');

function failure(outcome: Extract<AgentCommentOutcome<unknown>, { message: string }>) {
  return {
    status: outcome.status,
    body: { success: false as const, message: outcome.message },
  };
}

const serverError = (message: string) => ({
  status: 500 as const,
  body: { success: false as const, message },
});

const s = initServer();

export const agentCommentsContractRouter = s.router(agentCommentsContract, {
  listAgentComments: async (args) => {
    try {
      const out = await listAgentComments(args.params.agentId, getAuthedUser(args.req).id);
      if ('message' in out) return failure(out);
      return { status: 200 as const, body: { success: true as const, ...out.data } };
    } catch (error) {
      log.error('Error listing agent comments', { error });
      return serverError('Kommentare konnten nicht geladen werden.');
    }
  },

  createAgentComment: async (args) => {
    try {
      const out = await createAgentComment({
        agentId: args.params.agentId,
        userId: getAuthedUser(args.req).id,
        body: args.body.body,
        parentId: args.body.parentId,
      });
      if ('message' in out) return failure(out);
      return { status: 201 as const, body: { success: true as const, comment: out.data } };
    } catch (error) {
      log.error('Error creating agent comment', { error });
      return serverError('Kommentar konnte nicht gesendet werden.');
    }
  },

  deleteAgentComment: async (args) => {
    try {
      const out = await deleteAgentComment({
        agentId: args.params.agentId,
        commentId: args.params.commentId,
        userId: getAuthedUser(args.req).id,
      });
      if ('message' in out) return failure(out);
      return { status: 200 as const, body: { success: true as const } };
    } catch (error) {
      log.error('Error deleting agent comment', { error });
      return serverError('Kommentar konnte nicht gelöscht werden.');
    }
  },
});

export function mountAgentCommentsContractRouter(app: Application): void {
  createExpressEndpoints(agentCommentsContract, agentCommentsContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'agentCommentsContract'),
  });
}
