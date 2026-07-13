/**
 * ts-rest contract for /api/auth/custom_prompts and /api/auth/saved_prompts.
 *
 * Covers the user-prompt CRUD surface consumed by the Prompts UI. The
 * semantic-search / discovery endpoints on the same legacy router
 * (`/custom_prompts/search`, `/public_prompts`, `/public_prompts/search`)
 * are intentionally NOT modeled here — they return loosely-typed vector
 * results and stay on the legacy Express router (ts-rest matches its own
 * routes first; unmatched paths fall through).
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  createCustomPromptBodySchema,
  updateCustomPromptBodySchema,
  promptListResponseSchema,
  promptMutationResponseSchema,
  promptMessageResponseSchema,
  promptErrorResponseSchema,
} from '../schemas/prompts.js';

const c = initContract();

export const promptsContract = c.router(
  {
    /** GET /api/auth/custom_prompts — list the current user's own prompts. */
    listCustomPrompts: {
      method: 'GET',
      path: '/api/auth/custom_prompts',
      responses: {
        200: promptListResponseSchema,
        500: promptErrorResponseSchema,
      },
      summary: "List the user's custom prompts",
    },

    /** POST /api/auth/custom_prompts — create a prompt (name auto-generated). */
    createCustomPrompt: {
      method: 'POST',
      path: '/api/auth/custom_prompts',
      body: createCustomPromptBodySchema,
      responses: {
        200: promptMutationResponseSchema,
        400: promptErrorResponseSchema,
        500: promptErrorResponseSchema,
      },
      summary: 'Create a custom prompt',
    },

    /** PUT /api/auth/custom_prompts/:id — update a prompt the user owns. */
    updateCustomPrompt: {
      method: 'PUT',
      path: '/api/auth/custom_prompts/:id',
      pathParams: z.object({ id: z.string() }),
      body: updateCustomPromptBodySchema,
      responses: {
        200: promptMutationResponseSchema,
        403: promptErrorResponseSchema,
        404: promptErrorResponseSchema,
        500: promptErrorResponseSchema,
      },
      summary: 'Update a custom prompt',
    },

    /** DELETE /api/auth/custom_prompts/:id — delete a prompt the user owns. */
    deleteCustomPrompt: {
      method: 'DELETE',
      path: '/api/auth/custom_prompts/:id',
      pathParams: z.object({ id: z.string() }),
      body: c.noBody(),
      responses: {
        200: promptMessageResponseSchema,
        403: promptErrorResponseSchema,
        404: promptErrorResponseSchema,
        500: promptErrorResponseSchema,
      },
      summary: 'Delete a custom prompt',
    },

    /** GET /api/auth/saved_prompts — list prompts the user saved from others. */
    listSavedPrompts: {
      method: 'GET',
      path: '/api/auth/saved_prompts',
      responses: {
        200: promptListResponseSchema,
        500: promptErrorResponseSchema,
      },
      summary: "List the user's saved prompts",
    },

    /** POST /api/auth/saved_prompts/:promptId — save another user's prompt. */
    saveSavedPrompt: {
      method: 'POST',
      path: '/api/auth/saved_prompts/:promptId',
      pathParams: z.object({ promptId: z.string() }),
      body: c.noBody(),
      responses: {
        200: promptMessageResponseSchema,
        400: promptErrorResponseSchema,
        404: promptErrorResponseSchema,
        500: promptErrorResponseSchema,
      },
      summary: 'Save another user’s prompt',
    },

    /** DELETE /api/auth/saved_prompts/:promptId — unsave a prompt. */
    deleteSavedPrompt: {
      method: 'DELETE',
      path: '/api/auth/saved_prompts/:promptId',
      pathParams: z.object({ promptId: z.string() }),
      body: c.noBody(),
      responses: {
        200: promptMessageResponseSchema,
        404: promptErrorResponseSchema,
        500: promptErrorResponseSchema,
      },
      summary: 'Unsave a prompt',
    },
  },
  { pathPrefix: '' }
);
