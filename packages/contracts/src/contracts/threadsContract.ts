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
  tabularFilesResponseSchema,
  saveReviewedSharepicBodySchema,
  successResponseSchema,
  deleteThreadResponseSchema,
  errorResponseSchema,
  threadStatusSchema,
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
        status: threadStatusSchema.optional(),
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
     *
     * `onlyIfEmpty=true` is the client's empty-thread cleanup: the server then
     * removes the thread only if it has no message at all and answers 409
     * otherwise. Its list may be older than the thread's first message; the
     * check has to sit in the DELETE itself (#5465).
     */
    delete: {
      method: 'DELETE',
      path: '/api/chat-service/threads',
      query: z.object({
        threadId: z.string(),
        onlyIfEmpty: z.enum(['true']).optional(),
      }),
      body: c.noBody(),
      responses: {
        200: deleteThreadResponseSchema,
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        409: errorResponseSchema,
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

    /**
     * GET /api/chat-service/threads/:threadId/tabular-files
     * Raw bytes (base64) of the thread's tabular attachments, so the frontend can
     * rehydrate the in-browser pandas interpreter after a reload.
     */
    getTabularFiles: {
      method: 'GET',
      path: '/api/chat-service/threads/:threadId/tabular-files',
      pathParams: z.object({ threadId: z.string() }),
      responses: {
        200: tabularFilesResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema,
      },
      summary: 'Get raw bytes of a thread’s tabular attachments',
    },

    /**
     * PUT /api/chat-service/threads/:threadId/sharepic-variants/:variantId/reviewed-spec
     * The browser's vision review corrected a chat creator sharepic after the
     * turn; the corrected spec replaces the persisted one. 409 once the variant
     * is a canvas (the canvas is the truth then).
     */
    saveReviewedSharepic: {
      method: 'PUT',
      path: '/api/chat-service/threads/:threadId/sharepic-variants/:variantId/reviewed-spec',
      pathParams: z.object({ threadId: z.string(), variantId: z.string() }),
      body: saveReviewedSharepicBodySchema,
      responses: {
        200: successResponseSchema,
        400: errorResponseSchema,
        401: errorResponseSchema,
        404: errorResponseSchema,
        409: errorResponseSchema,
        500: errorResponseSchema,
      },
      summary: 'Save the reviewed spec of a chat creator sharepic',
    },
  },
  { pathPrefix: '' }
);
