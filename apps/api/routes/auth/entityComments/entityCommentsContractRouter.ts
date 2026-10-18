/**
 * ts-rest contract router for marketplace item comments (/api/comments).
 * requireAuth is applied at the prefix in routes.ts; access rules live in
 * `services/entityComments/`.
 */
import { entityCommentsContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import {
  createEntityComment,
  deleteEntityComment,
  type EntityCommentOutcome,
  listEntityComments,
} from '../../../services/entityComments/entityCommentsService.js';
import { logContractValidationError } from '../../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../../utils/getAuthedUser.js';
import { createLogger } from '../../../utils/logger.js';

import type { Application } from 'express';

const log = createLogger('entityCommentsContractRouter');

/** Shared with the legacy agent and template comment routers. */
export function commentFailure(
  outcome: Extract<EntityCommentOutcome<unknown>, { message: string }>
) {
  return {
    status: outcome.status,
    body: { success: false as const, message: outcome.message },
  };
}

export const commentServerError = (message: string) => ({
  status: 500 as const,
  body: { success: false as const, message },
});

const s = initServer();

export const entityCommentsContractRouter = s.router(entityCommentsContract, {
  listEntityComments: async (args) => {
    try {
      const { entityType, entityId } = args.params;
      const out = await listEntityComments(entityType, entityId, getAuthedUser(args.req).id);
      if ('message' in out) return commentFailure(out);
      return { status: 200 as const, body: { success: true as const, ...out.data } };
    } catch (error) {
      log.error('Error listing comments', { error });
      return commentServerError('Kommentare konnten nicht geladen werden.');
    }
  },

  createEntityComment: async (args) => {
    try {
      const out = await createEntityComment({
        entityType: args.params.entityType,
        entityId: args.params.entityId,
        userId: getAuthedUser(args.req).id,
        body: args.body.body,
        parentId: args.body.parentId ?? null,
      });
      if ('message' in out) return commentFailure(out);
      return { status: 201 as const, body: { success: true as const, comment: out.data } };
    } catch (error) {
      log.error('Error creating comment', { error });
      return commentServerError('Kommentar konnte nicht gesendet werden.');
    }
  },

  deleteEntityComment: async (args) => {
    try {
      const out = await deleteEntityComment({
        entityType: args.params.entityType,
        entityId: args.params.entityId,
        commentId: args.params.commentId,
        userId: getAuthedUser(args.req).id,
      });
      if ('message' in out) return commentFailure(out);
      return { status: 200 as const, body: { success: true as const } };
    } catch (error) {
      log.error('Error deleting comment', { error });
      return commentServerError('Kommentar konnte nicht gelöscht werden.');
    }
  },
});

export function mountEntityCommentsContractRouter(app: Application): void {
  createExpressEndpoints(entityCommentsContract, entityCommentsContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'entityCommentsContract'),
  });
}
