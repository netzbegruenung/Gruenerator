/**
 * ts-rest contract router for Vorlagen comments (/api/auth/template-comments).
 * requireAuth is applied at the prefix in routes.ts; access rules live in
 * `services/templateComments/templateCommentsService.ts`.
 */
import { templateCommentsContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import {
  createTemplateComment,
  deleteTemplateComment,
  listTemplateComments,
  type TemplateCommentOutcome,
} from '../../../services/templateComments/templateCommentsService.js';
import { logContractValidationError } from '../../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../../utils/getAuthedUser.js';
import { createLogger } from '../../../utils/logger.js';

import type { Application } from 'express';

const log = createLogger('templateCommentsContractRouter');

function failure(outcome: Extract<TemplateCommentOutcome<unknown>, { message: string }>) {
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

export const templateCommentsContractRouter = s.router(templateCommentsContract, {
  listTemplateComments: async (args) => {
    try {
      const out = await listTemplateComments(args.params.templateId, getAuthedUser(args.req).id);
      if ('message' in out) return failure(out);
      return { status: 200 as const, body: { success: true as const, comments: out.data } };
    } catch (error) {
      log.error('Error listing template comments', { error });
      return serverError('Kommentare konnten nicht geladen werden.');
    }
  },

  createTemplateComment: async (args) => {
    try {
      const out = await createTemplateComment({
        templateId: args.params.templateId,
        userId: getAuthedUser(args.req).id,
        body: args.body.body,
        parentId: args.body.parentId,
      });
      if ('message' in out) return failure(out);
      return { status: 201 as const, body: { success: true as const, comment: out.data } };
    } catch (error) {
      log.error('Error creating template comment', { error });
      return serverError('Kommentar konnte nicht gesendet werden.');
    }
  },

  deleteTemplateComment: async (args) => {
    try {
      const out = await deleteTemplateComment({
        templateId: args.params.templateId,
        commentId: args.params.commentId,
        userId: getAuthedUser(args.req).id,
      });
      if ('message' in out) return failure(out);
      return { status: 200 as const, body: { success: true as const } };
    } catch (error) {
      log.error('Error deleting template comment', { error });
      return serverError('Kommentar konnte nicht gelöscht werden.');
    }
  },
});

export function mountTemplateCommentsContractRouter(app: Application): void {
  createExpressEndpoints(templateCommentsContract, templateCommentsContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'templateCommentsContract'),
  });
}
