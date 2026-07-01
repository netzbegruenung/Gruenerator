/**
 * ts-rest contract for /api/chat-service/threads
 *
 * Covers the full CRUD surface served by threadsContractRouter.ts.
 * All authenticated — the backend enforces auth; the contract just models shape.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  threadListResponseSchema,
  createThreadBodySchema,
  createThreadResponseSchema,
  patchThreadBodySchema,
  patchThreadResponseSchema,
  patchThreadSettingsBodySchema,
  threadSettingsResponseSchema,
  generateTitleResponseSchema,
  successResponseSchema,
  errorResponseSchema,
} from '../schemas/threads.js';

const c = initContract();

export const threadsContract = c.router(
  {
    /**
     * GET /api/chat-service/threads
     * List all threads for the authenticated user (including shared + group threads).
     * Optional ?status=archived query param.
     */
    list: {
      method: 'GET',
      path: '/api/chat-service/threads',
      query: z.object({
        status: z.enum(['regular', 'archived']).optional(),
      }),
      responses: {
        200: threadListResponseSchema,
        401: errorResponseSchema,
        500: errorResponseSchema,
      },
      summary: 'List chat threads',
    },

    /**
     * POST /api/chat-service/threads
     * Create a new chat thread.
     */
    create: {
      method: 'POST',
      path: '/api/chat-service/threads',
      body: createThreadBodySchema,
      responses: {
        201: createThreadResponseSchema,
        401: errorResponseSchema,
        500: errorResponseSchema,
      },
      summary: 'Create a chat thread',
    },

    /**
     * PATCH /api/chat-service/threads
     * Rename or archive/unarchive a thread.
     */
    update: {
      method: 'PATCH',
      path: '/api/chat-service/threads',
      body: patchThreadBodySchema,
      responses: {
        200: patchThreadResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema,
      },
      summary: 'Update thread title or status',
    },

    /**
     * DELETE /api/chat-service/threads?threadId=<id>
     * Delete a thread owned by the authenticated user.
     */
    delete: {
      method: 'DELETE',
      path: '/api/chat-service/threads',
      query: z.object({
        threadId: z.string(),
      }),
      body: c.noBody(),
      responses: {
        200: successResponseSchema,
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema,
      },
      summary: 'Delete a chat thread',
    },

    /**
     * GET /api/chat-service/threads/:threadId/settings
     */
    getSettings: {
      method: 'GET',
      path: '/api/chat-service/threads/:threadId/settings',
      pathParams: z.object({ threadId: z.string() }),
      responses: {
        200: threadSettingsResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema,
      },
      summary: 'Get per-thread settings',
    },

    /**
     * PATCH /api/chat-service/threads/:threadId/settings
     */
    updateSettings: {
      method: 'PATCH',
      path: '/api/chat-service/threads/:threadId/settings',
      pathParams: z.object({ threadId: z.string() }),
      body: patchThreadSettingsBodySchema,
      responses: {
        200: successResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema,
      },
      summary: 'Update per-thread settings',
    },

    /**
     * POST /api/chat-service/threads/:threadId/generate-title
     * Fire-and-forget: returns 202 Accepted immediately.
     */
    generateTitle: {
      method: 'POST',
      path: '/api/chat-service/threads/:threadId/generate-title',
      pathParams: z.object({ threadId: z.string() }),
      body: c.noBody(),
      responses: {
        202: generateTitleResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        503: errorResponseSchema,
        500: errorResponseSchema,
      },
      summary: 'Trigger async AI title generation',
    },
  },
  { pathPrefix: '' }
);
