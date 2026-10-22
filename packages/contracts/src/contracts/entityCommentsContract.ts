/**
 * ts-rest contract for /api/comments
 *
 * Comments on any marketplace item, keyed like likes: `entityType` is the
 * item kind, `entityId` its marketplace `ref`. Visible to everyone who may see
 * the item. Supersedes /api/auth/agent-comments and /api/auth/template-comments.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  createEntityCommentBodySchema,
  entityCommentErrorSchema,
  entityCommentResponseSchema,
  entityCommentsResponseSchema,
} from '../schemas/entityComments.js';
import { entityCommentTypeSchema } from '../schemas/entityLikes.js';

const c = initContract();

const errors = {
  400: entityCommentErrorSchema,
  401: entityCommentErrorSchema,
  403: entityCommentErrorSchema,
  404: entityCommentErrorSchema,
  500: entityCommentErrorSchema,
};

const itemParams = z.object({
  entityType: entityCommentTypeSchema,
  entityId: z.string().min(1).max(200),
});

export const entityCommentsContract = c.router(
  {
    listEntityComments: {
      method: 'GET',
      path: '/api/comments/:entityType/:entityId',
      pathParams: itemParams,
      responses: { 200: entityCommentsResponseSchema, ...errors },
      summary: 'List comments (and the item reactions) of a marketplace item',
    },
    createEntityComment: {
      method: 'POST',
      path: '/api/comments/:entityType/:entityId',
      pathParams: itemParams,
      body: createEntityCommentBodySchema,
      responses: { 201: entityCommentResponseSchema, ...errors },
      summary: 'Comment on a marketplace item or reply to a comment',
    },
    deleteEntityComment: {
      method: 'DELETE',
      path: '/api/comments/:entityType/:entityId/:commentId',
      pathParams: itemParams.extend({ commentId: z.string().uuid() }),
      body: c.noBody(),
      responses: { 200: z.object({ success: z.literal(true) }), ...errors },
      summary: 'Delete a comment (author or item owner)',
    },
  },
  { pathPrefix: '' }
);
