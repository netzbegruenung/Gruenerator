/**
 * ts-rest contract router for Vorlagen comments (/api/auth/template-comments).
 * Legacy surface: it delegates to the marketplace comments
 * (`services/entityComments/`) with the item `('template', templateId)`.
 * requireAuth is applied at the prefix in routes.ts.
 */
import {
  type EntityComment,
  type TemplateComment,
  templateCommentsContract,
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

const log = createLogger('templateCommentsContractRouter');

function toTemplateComment(c: EntityComment): TemplateComment {
  return {
    id: c.id,
    templateId: c.entityId,
    parentId: c.parentId,
    userId: c.userId,
    authorName: c.authorName,
    body: c.body,
    createdAt: c.createdAt,
    reactions: c.reactions,
  };
}

const s = initServer();

export const templateCommentsContractRouter = s.router(templateCommentsContract, {
  listTemplateComments: async (args) => {
    try {
      const out = await listEntityComments(
        'template',
        args.params.templateId,
        getAuthedUser(args.req).id
      );
      if ('message' in out) return commentFailure(out);
      return {
        status: 200 as const,
        body: { success: true as const, comments: out.data.comments.map(toTemplateComment) },
      };
    } catch (error) {
      log.error('Error listing template comments', { error });
      return commentServerError('Kommentare konnten nicht geladen werden.');
    }
  },

  createTemplateComment: async (args) => {
    try {
      const out = await createEntityComment({
        entityType: 'template',
        entityId: args.params.templateId,
        userId: getAuthedUser(args.req).id,
        body: args.body.body,
        parentId: args.body.parentId ?? null,
      });
      if ('message' in out) return commentFailure(out);
      return {
        status: 201 as const,
        body: { success: true as const, comment: toTemplateComment(out.data) },
      };
    } catch (error) {
      log.error('Error creating template comment', { error });
      return commentServerError('Kommentar konnte nicht gesendet werden.');
    }
  },

  deleteTemplateComment: async (args) => {
    try {
      const out = await deleteEntityComment({
        entityType: 'template',
        entityId: args.params.templateId,
        commentId: args.params.commentId,
        userId: getAuthedUser(args.req).id,
      });
      if ('message' in out) return commentFailure(out);
      return { status: 200 as const, body: { success: true as const } };
    } catch (error) {
      log.error('Error deleting template comment', { error });
      return commentServerError('Kommentar konnte nicht gelöscht werden.');
    }
  },
});

export function mountTemplateCommentsContractRouter(app: Application): void {
  createExpressEndpoints(templateCommentsContract, templateCommentsContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'templateCommentsContract'),
  });
}
