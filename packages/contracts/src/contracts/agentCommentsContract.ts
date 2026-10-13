/**
 * ts-rest contract for /api/auth/agent-comments
 *
 * Comments on a user agent, visible to everyone who may open the agent.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  agentCommentErrorSchema,
  agentCommentResponseSchema,
  agentCommentsResponseSchema,
  createAgentCommentBodySchema,
} from '../schemas/agentComments.js';

const c = initContract();

const errors = {
  400: agentCommentErrorSchema,
  401: agentCommentErrorSchema,
  403: agentCommentErrorSchema,
  404: agentCommentErrorSchema,
  500: agentCommentErrorSchema,
};

const agentParams = z.object({ agentId: z.string().min(1).max(100) });

export const agentCommentsContract = c.router(
  {
    listAgentComments: {
      method: 'GET',
      path: '/api/auth/agent-comments/:agentId',
      pathParams: agentParams,
      responses: { 200: agentCommentsResponseSchema, ...errors },
      summary: 'List comments (and the agent reactions) of an agent',
    },
    createAgentComment: {
      method: 'POST',
      path: '/api/auth/agent-comments/:agentId',
      pathParams: agentParams,
      body: createAgentCommentBodySchema,
      responses: { 201: agentCommentResponseSchema, ...errors },
      summary: 'Comment on an agent or reply to a comment',
    },
    deleteAgentComment: {
      method: 'DELETE',
      path: '/api/auth/agent-comments/:agentId/:commentId',
      pathParams: agentParams.extend({ commentId: z.string().min(1).max(100) }),
      body: c.noBody(),
      responses: { 200: z.object({ success: z.literal(true) }), ...errors },
      summary: 'Delete a comment (author or agent owner)',
    },
  },
  { pathPrefix: '' }
);
