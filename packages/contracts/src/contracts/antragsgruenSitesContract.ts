/**
 * ts-rest contract for the Antragsgrün sites the Grünerator created for the
 * person. Auth via `requireAuth` at the /api/auth/antragsgruen-sites prefix.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  antragsgruenSiteAccessResponseSchema,
  antragsgruenSiteErrorSchema,
  antragsgruenSiteListResponseSchema,
} from '../schemas/antragsgruenSites.js';

const c = initContract();

export const antragsgruenSitesContract = c.router({
  /** GET /api/auth/antragsgruen-sites — the person's sites from our table. */
  listSites: {
    method: 'GET',
    path: '/api/auth/antragsgruen-sites',
    responses: {
      200: antragsgruenSiteListResponseSchema,
      401: antragsgruenSiteErrorSchema,
      500: antragsgruenSiteErrorSchema,
    },
    summary: 'List the Antragsgrün sites the Grünerator created for the account',
  },

  /** GET /api/auth/antragsgruen-sites/access — live: is the Grünerator still admin on each site? */
  siteAccess: {
    method: 'GET',
    path: '/api/auth/antragsgruen-sites/access',
    responses: {
      200: antragsgruenSiteAccessResponseSchema,
      401: antragsgruenSiteErrorSchema,
      500: antragsgruenSiteErrorSchema,
    },
    summary: 'Check whether the Grünerator account is still admin on each site',
  },

  /**
   * DELETE /api/auth/antragsgruen-sites/:id — forget the site. The Grünerator
   * stops acting on it; nothing changes on antragsgruen.de.
   */
  forgetSite: {
    method: 'DELETE',
    path: '/api/auth/antragsgruen-sites/:id',
    pathParams: z.object({ id: z.string().uuid() }),
    responses: {
      200: z.object({ success: z.literal(true) }),
      401: antragsgruenSiteErrorSchema,
      404: antragsgruenSiteErrorSchema,
      500: antragsgruenSiteErrorSchema,
    },
    summary: 'Remove an Antragsgrün site from the account',
  },
});
