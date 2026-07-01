/**
 * ts-rest contract for user template (Vorlagen) CRUD endpoints.
 *
 * Covers the 8 routes from apps/api/routes/auth/templates/userTemplates.ts.
 * All routes require authentication (requireAuth is applied at the
 * /api/auth/user-templates prefix in routes.ts).
 *
 * Route ordering note: `bulkDelete` is declared before `remove` so
 * createExpressEndpoints registers DELETE /user-templates/bulk before the
 * DELETE /user-templates/:id param route, preventing ":id" from swallowing
 * "bulk".
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  fromUrlBodySchema,
  fromCanvasBodySchema,
  createTemplateBodySchema,
  updateTemplateBodySchema,
  metadataUpdateBodySchema,
  bulkDeleteTemplatesBodySchema,
  instantiateBodySchema,
  describeImageBodySchema,
  describeImageResponseSchema,
  userTemplatesListResponseSchema,
  userTemplatePreviewResponseSchema,
  userTemplateCreatedFromUrlResponseSchema,
  userTemplateItemResponseSchema,
  userTemplateMessageResponseSchema,
  userTemplateBulkDeleteResponseSchema,
  userTemplateInstantiateResponseSchema,
  userTemplatesErrorResponseSchema,
} from '../schemas/userTemplates.js';

const c = initContract();

export const userTemplatesContract = c.router(
  {
    /** POST /api/auth/user-templates/from-url — crawl a URL; preview (200) or save (201). */
    fromUrl: {
      method: 'POST',
      path: '/api/auth/user-templates/from-url',
      body: fromUrlBodySchema,
      responses: {
        200: userTemplatePreviewResponseSchema,
        201: userTemplateCreatedFromUrlResponseSchema,
        400: userTemplatesErrorResponseSchema,
        500: userTemplatesErrorResponseSchema,
      },
      summary: 'Create or preview a template from a URL',
    },

    /**
     * POST /api/auth/user-templates/from-canvas — publish one of the caller's
     * canvas sharepics as a public Grünerator-Vorlage (snapshot + review row).
     */
    fromCanvas: {
      method: 'POST',
      path: '/api/auth/user-templates/from-canvas',
      body: fromCanvasBodySchema,
      responses: {
        201: userTemplateCreatedFromUrlResponseSchema,
        400: userTemplatesErrorResponseSchema,
        403: userTemplatesErrorResponseSchema,
        404: userTemplatesErrorResponseSchema,
        500: userTemplatesErrorResponseSchema,
      },
      summary: 'Publish a canvas as a Grünerator-Vorlage',
    },

    /** GET /api/auth/user-templates — the caller's own templates. */
    list: {
      method: 'GET',
      path: '/api/auth/user-templates',
      query: z.object({
        template_type: z.string().optional(),
      }),
      responses: {
        200: userTemplatesListResponseSchema,
        500: userTemplatesErrorResponseSchema,
      },
      summary: 'List the current user templates',
    },

    /** POST /api/auth/user-templates — create a template (JSON). */
    create: {
      method: 'POST',
      path: '/api/auth/user-templates',
      body: createTemplateBodySchema,
      responses: {
        201: userTemplateItemResponseSchema,
        400: userTemplatesErrorResponseSchema,
        500: userTemplatesErrorResponseSchema,
      },
      summary: 'Create a user template',
    },

    /** DELETE /api/auth/user-templates/bulk — delete up to 100 owned templates. */
    bulkDelete: {
      method: 'DELETE',
      path: '/api/auth/user-templates/bulk',
      body: bulkDeleteTemplatesBodySchema,
      responses: {
        200: userTemplateBulkDeleteResponseSchema,
        403: userTemplatesErrorResponseSchema,
        500: userTemplatesErrorResponseSchema,
      },
      summary: 'Bulk delete user templates',
    },

    /** PUT /api/auth/user-templates/:id — update a template. */
    update: {
      method: 'PUT',
      path: '/api/auth/user-templates/:id',
      body: updateTemplateBodySchema,
      responses: {
        200: userTemplateItemResponseSchema,
        403: userTemplatesErrorResponseSchema,
        404: userTemplatesErrorResponseSchema,
        500: userTemplatesErrorResponseSchema,
      },
      summary: 'Update a user template',
    },

    /** DELETE /api/auth/user-templates/:id — delete a single owned template. */
    remove: {
      method: 'DELETE',
      path: '/api/auth/user-templates/:id',
      responses: {
        200: userTemplateMessageResponseSchema,
        404: userTemplatesErrorResponseSchema,
        500: userTemplatesErrorResponseSchema,
      },
      summary: 'Delete a user template',
    },

    /** POST /api/auth/user-templates/:id/metadata — update metadata only. */
    updateMetadata: {
      method: 'POST',
      path: '/api/auth/user-templates/:id/metadata',
      body: metadataUpdateBodySchema,
      responses: {
        200: userTemplateMessageResponseSchema,
        403: userTemplatesErrorResponseSchema,
        404: userTemplatesErrorResponseSchema,
        500: userTemplatesErrorResponseSchema,
      },
      summary: 'Update user template metadata',
    },

    /** POST /api/auth/user-templates/describe-image — on-demand AI description from an image. */
    describeImage: {
      method: 'POST',
      path: '/api/auth/user-templates/describe-image',
      body: describeImageBodySchema,
      responses: {
        200: describeImageResponseSchema,
        400: userTemplatesErrorResponseSchema,
        500: userTemplatesErrorResponseSchema,
      },
      summary: 'Generate an AI description for a template image',
    },

    /** POST /api/auth/user-templates/:id/instantiate — new collaborative doc from a template. */
    instantiate: {
      method: 'POST',
      path: '/api/auth/user-templates/:id/instantiate',
      body: instantiateBodySchema,
      responses: {
        201: userTemplateInstantiateResponseSchema,
        400: userTemplatesErrorResponseSchema,
        403: userTemplatesErrorResponseSchema,
        404: userTemplatesErrorResponseSchema,
        500: userTemplatesErrorResponseSchema,
      },
      summary: 'Instantiate a document from a template',
    },
  },
  { pathPrefix: '' }
);
