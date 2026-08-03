/**
 * ts-rest contract for per-user learned writing styles ("angelernte Textformen").
 *
 * Covers apps/api/routes/userTextForms/userTextFormsContractRouter.ts. All routes
 * require authentication (requireAuth is applied at the /api/text-forms prefix in
 * routes.ts).
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  analyzeTextFormBodySchema,
  analyzeTextFormResponseSchema,
  saveTextFormBodySchema,
  textFormDeleteResponseSchema,
  textFormShareBodySchema,
  textFormShareResponseSchema,
  textFormErrorResponseSchema,
  textFormItemResponseSchema,
  textFormsListResponseSchema,
} from '../schemas/textForm.js';

const c = initContract();

export const userTextFormsContract = c.router(
  {
    /** GET /api/text-forms — the caller's own learned text forms. */
    list: {
      method: 'GET',
      path: '/api/text-forms',
      responses: {
        200: textFormsListResponseSchema,
        401: textFormErrorResponseSchema,
        500: textFormErrorResponseSchema,
      },
      summary: 'List the current user text forms',
    },

    /** POST /api/text-forms/analyze — distill a style block from examples. */
    analyze: {
      method: 'POST',
      path: '/api/text-forms/analyze',
      body: analyzeTextFormBodySchema,
      responses: {
        200: analyzeTextFormResponseSchema,
        400: textFormErrorResponseSchema,
        401: textFormErrorResponseSchema,
        500: textFormErrorResponseSchema,
      },
      summary: 'Analyze example texts into an editable style block',
    },

    /** PUT /api/text-forms/:mention — create or update a text form. */
    save: {
      method: 'PUT',
      path: '/api/text-forms/:mention',
      pathParams: z.object({ mention: z.string() }),
      body: saveTextFormBodySchema,
      responses: {
        200: textFormItemResponseSchema,
        400: textFormErrorResponseSchema,
        401: textFormErrorResponseSchema,
        409: textFormErrorResponseSchema,
        500: textFormErrorResponseSchema,
      },
      summary: 'Create or update a user text form',
    },

    /** DELETE /api/text-forms/:mention — delete a text form. */
    remove: {
      method: 'DELETE',
      path: '/api/text-forms/:mention',
      pathParams: z.object({ mention: z.string() }),
      responses: {
        200: textFormDeleteResponseSchema,
        401: textFormErrorResponseSchema,
        404: textFormErrorResponseSchema,
        500: textFormErrorResponseSchema,
      },
      summary: 'Delete a user text form',
    },

    /**
     * PUT /api/text-forms/:mention/share — share the recipe with a group.
     * Members can use it immediately; the listing marks it as coming from
     * that group rather than blending it into their own.
     */
    share: {
      method: 'PUT',
      path: '/api/text-forms/:mention/share',
      pathParams: z.object({ mention: z.string() }),
      body: textFormShareBodySchema,
      responses: {
        200: textFormShareResponseSchema,
        401: textFormErrorResponseSchema,
        403: textFormErrorResponseSchema,
        404: textFormErrorResponseSchema,
        500: textFormErrorResponseSchema,
      },
      summary: 'Share a recipe with a group',
    },

    /** DELETE /api/text-forms/:mention/share — revoke a group share. */
    unshare: {
      method: 'DELETE',
      path: '/api/text-forms/:mention/share',
      pathParams: z.object({ mention: z.string() }),
      body: textFormShareBodySchema,
      responses: {
        200: textFormShareResponseSchema,
        401: textFormErrorResponseSchema,
        404: textFormErrorResponseSchema,
        500: textFormErrorResponseSchema,
      },
      summary: 'Revoke a recipe’s group share',
    },
  },
  { pathPrefix: '' }
);
