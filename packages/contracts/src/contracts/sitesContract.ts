/**
 * ts-rest contract for the candidate-site builder CRUD endpoints.
 *
 * The JSON CRUD surface consumed by packages/sites (useSite): list, by-handle,
 * create, update, publish, check-subdomain, delete. An account may own up to
 * SITES_PER_ACCOUNT_MAX live sites.
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
  siteByHandleResponseSchema,
  siteListResponseSchema,
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
   * GET /api/sites
   * The current user's live sites, most recently edited first.
   */
  listSites: {
    method: 'GET',
    path: '/api/sites',
    responses: {
      200: siteListResponseSchema,
      401: sitesErrorSchema,
      403: sitesErrorSchema,
      500: sitesErrorSchema,
    },
    summary: "List the current user's sites",
  },

  /**
   * GET /api/sites/by-handle/:handle
   * One of the current user's sites by its address, or by its id (the editor
   * falls back to the id when the address it opened with has changed).
   */
  getSiteByHandle: {
    method: 'GET',
    path: '/api/sites/by-handle/:handle',
    pathParams: z.object({ handle: z.string().min(1).max(64) }),
    responses: {
      200: siteByHandleResponseSchema,
      401: sitesErrorSchema,
      403: sitesErrorSchema,
      404: sitesErrorSchema,
      500: sitesErrorSchema,
    },
    summary: "Get one of the current user's sites",
  },

  /**
   * GET /api/sites/my-site
   * @deprecated since 2026-11-20 — use listSites / getSiteByHandle. Kept for web
   * tabs opened before the multi-site deploy; answers the most recently edited
   * site, or { site: null }. Remove after 2027-02-20.
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
   * Create a site. 400 covers invalid/reserved/taken subdomains, 409 an
   * account already at SITES_PER_ACCOUNT_MAX live sites.
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
      409: sitesErrorSchema,
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
