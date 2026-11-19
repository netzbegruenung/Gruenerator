/**
 * ts-rest contract for the candidate-site builder CRUD endpoints.
 *
 * Phase 1 covers the JSON CRUD surface consumed by packages/sites (useSite):
 * my-site, create, update, publish, check-subdomain, delete.
 *
 * POST /api/sites/generate (streamed generation) is contracted below; its 200 is SSE.
 *
 * Authentication: all routes here require auth. routes.ts applies requireAuth
 * for /api/sites before this router is mounted.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { siteGenerateBodySchema } from '../schemas/siteGeneration.js';
import {
  mySiteResponseSchema,
  siteResponseSchema,
  createSiteBodySchema,
  updateUserSiteBodySchema,
  publishSiteBodySchema,
  checkSubdomainResponseSchema,
  deleteSiteResponseSchema,
  sitesErrorSchema,
  sitePublishErrorSchema,
} from '../schemas/sites.js';

const c = initContract();

export const sitesContract = c.router({
  /**
   * POST /api/sites/generate
   * The 200 body is an SSE stream of `siteGenerationEventSchema` frames
   * (`event: <type>`), written by the handler (same convention as
   * `chatGraphContract`). The file part is `SITE_FLYER_FIELD` and lives in
   * `req.file`, not in the body schema; exactly one of `description` and the
   * file part must be sent.
   */
  generateSiteContent: {
    method: 'POST',
    path: '/api/sites/generate',
    contentType: 'multipart/form-data',
    body: siteGenerateBodySchema,
    responses: {
      200: c.noBody(),
      400: sitesErrorSchema,
      401: sitesErrorSchema,
      403: sitesErrorSchema,
      413: sitesErrorSchema,
      500: sitesErrorSchema,
    },
    summary: 'Generate site content from a description or flyer (SSE)',
  },

  /**
   * GET /api/sites/my-site
   * The current user's site, or { site: null } if none exists yet.
   */
  getMySite: {
    method: 'GET',
    path: '/api/sites/my-site',
    responses: {
      200: mySiteResponseSchema,
      401: sitesErrorSchema,
      403: sitesErrorSchema,
      500: sitesErrorSchema,
    },
    summary: "Get the current user's site",
  },

  /**
   * POST /api/sites/create
   * Create the user's (single) site. 400 covers invalid/reserved/taken
   * subdomains and "site already exists".
   */
  createSite: {
    method: 'POST',
    path: '/api/sites/create',
    body: createSiteBodySchema,
    responses: {
      200: siteResponseSchema,
      400: sitesErrorSchema,
      401: sitesErrorSchema,
      403: sitesErrorSchema,
      500: sitesErrorSchema,
    },
    summary: 'Create a new site',
  },

  /**
   * PUT /api/sites/:id
   * Partial update of allowed site fields.
   */
  updateSite: {
    method: 'PUT',
    path: '/api/sites/:id',
    pathParams: z.object({ id: z.string().guid() }),
    body: updateUserSiteBodySchema,
    responses: {
      200: siteResponseSchema,
      400: sitesErrorSchema,
      401: sitesErrorSchema,
      403: sitesErrorSchema,
      404: sitesErrorSchema,
      500: sitesErrorSchema,
    },
    summary: 'Update a site',
  },

  /**
   * POST /api/sites/:id/publish
   * Publish (publish: true) or unpublish (publish: false) a site.
   */
  publishSite: {
    method: 'POST',
    path: '/api/sites/:id/publish',
    pathParams: z.object({ id: z.string().guid() }),
    body: publishSiteBodySchema,
    responses: {
      200: siteResponseSchema,
      401: sitesErrorSchema,
      403: sitesErrorSchema,
      404: sitesErrorSchema,
      422: sitePublishErrorSchema,
      503: sitesErrorSchema,
      500: sitesErrorSchema,
    },
    summary: 'Publish or unpublish a site',
  },

  /**
   * POST /api/sites/:id/draft
   * Seeds the collaborative draft of a site from its row, if there is none yet.
   */
  prepareSiteDraft: {
    method: 'POST',
    path: '/api/sites/:id/draft',
    pathParams: z.object({ id: z.string().guid() }),
    body: z.object({}),
    responses: {
      200: z.object({ seeded: z.boolean() }),
      401: sitesErrorSchema,
      403: sitesErrorSchema,
      404: sitesErrorSchema,
      503: sitesErrorSchema,
      500: sitesErrorSchema,
    },
    summary: 'Prepare the collaborative draft of a site',
  },

  /**
   * GET /api/sites/check-subdomain?subdomain=...
   * Availability check used while picking a subdomain.
   */
  checkSubdomain: {
    method: 'GET',
    path: '/api/sites/check-subdomain',
    query: z.object({ subdomain: z.string() }),
    responses: {
      200: checkSubdomainResponseSchema,
      500: sitesErrorSchema,
    },
    summary: 'Check subdomain availability',
  },

  /**
   * DELETE /api/sites/:id
   */
  deleteSite: {
    method: 'DELETE',
    path: '/api/sites/:id',
    pathParams: z.object({ id: z.string().guid() }),
    body: z.object({}),
    responses: {
      200: deleteSiteResponseSchema,
      401: sitesErrorSchema,
      403: sitesErrorSchema,
      404: sitesErrorSchema,
      500: sitesErrorSchema,
    },
    summary: 'Delete a site',
  },
});
