/**
 * ts-rest contract for the candidate-site builder CRUD endpoints.
 *
 * Phase 1 covers the JSON CRUD surface consumed by packages/sites (useSite):
 * my-site, create, update, publish, check-subdomain, delete.
 *
 * Deliberately NOT contracted (still on the legacy axios paths):
 * - POST /api/sites/generate-from-flyer (multipart upload)
 * - POST /api/claude_website (AI generation)
 * - GET  /api/sites/public/:subdomain (no typed UI consumer)
 * - GET  /api/sites/themes
 *
 * Authentication: all routes here require auth. routes.ts applies requireAuth
 * for /api/sites (excluding /public/*) before this router is mounted.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  mySiteResponseSchema,
  siteResponseSchema,
  createSiteBodySchema,
  updateUserSiteBodySchema,
  publishSiteBodySchema,
  checkSubdomainResponseSchema,
  deleteSiteResponseSchema,
  sitesErrorSchema,
} from '../schemas/sites.js';

const c = initContract();

export const sitesContract = c.router({
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
    pathParams: z.object({ id: z.string() }),
    body: updateUserSiteBodySchema,
    responses: {
      200: siteResponseSchema,
      400: sitesErrorSchema,
      401: sitesErrorSchema,
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
    pathParams: z.object({ id: z.string() }),
    body: publishSiteBodySchema,
    responses: {
      200: siteResponseSchema,
      401: sitesErrorSchema,
      404: sitesErrorSchema,
      500: sitesErrorSchema,
    },
    summary: 'Publish or unpublish a site',
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
    pathParams: z.object({ id: z.string() }),
    body: z.object({}),
    responses: {
      200: deleteSiteResponseSchema,
      401: sitesErrorSchema,
      404: sitesErrorSchema,
      500: sitesErrorSchema,
    },
    summary: 'Delete a site',
  },
});
