/**
 * ts-rest contract for /api/auth/template-comments
 *
 * Comments on a Vorlage, visible to everyone who may see the Vorlage.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  createTemplateCommentBodySchema,
  templateCommentErrorSchema,
  templateCommentResponseSchema,
  templateCommentsResponseSchema,
} from '../schemas/templateComments.js';

const c = initContract();

const errors = {
  400: templateCommentErrorSchema,
  401: templateCommentErrorSchema,
  403: templateCommentErrorSchema,
  404: templateCommentErrorSchema,
  500: templateCommentErrorSchema,
};

const templateParams = z.object({ templateId: z.string().min(1).max(200) });

export const templateCommentsContract = c.router(
  {
    listTemplateComments: {
      method: 'GET',
      path: '/api/auth/template-comments/:templateId',
      pathParams: templateParams,
      responses: { 200: templateCommentsResponseSchema, ...errors },
      summary: 'List comments on a Vorlage',
    },
    createTemplateComment: {
      method: 'POST',
      path: '/api/auth/template-comments/:templateId',
      pathParams: templateParams,
      body: createTemplateCommentBodySchema,
      responses: { 201: templateCommentResponseSchema, ...errors },
      summary: 'Comment on a Vorlage or reply to a comment',
    },
    deleteTemplateComment: {
      method: 'DELETE',
      path: '/api/auth/template-comments/:templateId/:commentId',
      pathParams: templateParams.extend({ commentId: z.string().uuid() }),
      body: c.noBody(),
      responses: { 200: z.object({ success: z.literal(true) }), ...errors },
      summary: 'Delete a comment (author or Vorlage owner)',
    },
  },
  { pathPrefix: '' }
);
