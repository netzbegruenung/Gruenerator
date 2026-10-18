/**
 * ts-rest contract router for agent comments (/api/auth/agent-comments).
 * Legacy surface for shipped mobile binaries: it delegates to the marketplace
 * comments (`services/entityComments/`) with the item `('agent', agentId)`.
 * requireAuth is applied at the prefix in routes.ts.
 */
import {
  agentCommentsContract,
  type AgentComment,
  type EntityComment,
} from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import {
  createEntityComment,
  deleteEntityComment,
  listEntityComments,
} from '../../../services/entityComments/entityCommentsService.js';
import { logContractValidationError } from '../../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../../utils/getAuthedUser.js';
import { createLogger } from '../../../utils/logger.js';
import {
  commentFailure,
  commentServerError,
} from '../entityComments/entityCommentsContractRouter.js';

import type { Application } from 'express';

const log = createLogger('agentCommentsContractRouter');

function toAgentComment(c: EntityComment): AgentComment {
  return {
    id: c.id,
    agentId: c.entityId,
    parentId: c.parentId,
    userId: c.userId,
    authorName: c.authorName,
    body: c.body,
    createdAt: c.createdAt,
    reactions: c.reactions,
  };
}

const s = initServer();

export const agentCommentsContractRouter = s.router(agentCommentsContract, {
  listAgentComments: async (args) => {
    try {
      const out = await listEntityComments(
        'agent',
        args.params.agentId,
        getAuthedUser(args.req).id
      );
      if ('message' in out) return commentFailure(out);
      return {
        status: 200 as const,
        body: {
          success: true as const,
          reactions: out.data.reactions,
          comments: out.data.comments.map(toAgentComment),
        },
      };
    } catch (error) {
      log.error('Error listing agent comments', { error });
      return commentServerError('Kommentare konnten nicht geladen werden.');
    }
  },

  createAgentComment: async (args) => {
    try {
      const out = await createEntityComment({
        entityType: 'agent',
        entityId: args.params.agentId,
        userId: getAuthedUser(args.req).id,
        body: args.body.body,
        parentId: args.body.parentId ?? null,
      });
      if ('message' in out) return commentFailure(out);
      return {
        status: 201 as const,
        body: { success: true as const, comment: toAgentComment(out.data) },
      };
    } catch (error) {
      log.error('Error creating agent comment', { error });
      return commentServerError('Kommentar konnte nicht gesendet werden.');
    }
  },

  deleteAgentComment: async (args) => {
    try {
      const out = await deleteEntityComment({
        entityType: 'agent',
        entityId: args.params.agentId,
        commentId: args.params.commentId,
        userId: getAuthedUser(args.req).id,
      });
      if ('message' in out) return commentFailure(out);
      return { status: 200 as const, body: { success: true as const } };
    } catch (error) {
      log.error('Error deleting agent comment', { error });
      return commentServerError('Kommentar konnte nicht gelöscht werden.');
    }
  },
});

export function mountAgentCommentsContractRouter(app: Application): void {
  createExpressEndpoints(agentCommentsContract, agentCommentsContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'agentCommentsContract'),
  });
}
