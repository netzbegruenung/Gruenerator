/**
 * ts-rest contract for websites connected to a user account.
 *
 * User-scoped, not notebook-scoped: the same site can feed several notebooks
 * and "Texte anlernen" reads from it without any notebook involved. Auth via
 * `requireAuth` at the /api/auth/user-websites prefix.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  addUserWebsiteBodySchema,
  userWebsiteErrorSchema,
  userWebsiteListResponseSchema,
  userWebsiteResponseSchema,
} from '../schemas/userWebsite.js';

const c = initContract();

export const userWebsitesContract = c.router({
  /** GET /api/auth/user-websites — the user's websites incl. derived usage. */
  listWebsites: {
    method: 'GET',
    path: '/api/auth/user-websites',
    responses: {
      200: userWebsiteListResponseSchema,
      401: userWebsiteErrorSchema,
      500: userWebsiteErrorSchema,
    },
    summary: 'List the websites connected to the account',
  },

  /**
   * POST /api/auth/user-websites — probe a site and store it with its category
   * catalogue. 409 when the (normalised) URL is already connected.
   */
  addWebsite: {
    method: 'POST',
    path: '/api/auth/user-websites',
    body: addUserWebsiteBodySchema,
    responses: {
      200: userWebsiteResponseSchema,
      400: userWebsiteErrorSchema,
      401: userWebsiteErrorSchema,
      409: userWebsiteErrorSchema,
      422: userWebsiteErrorSchema,
      500: userWebsiteErrorSchema,
    },
    summary: 'Connect a website to the account',
  },

  /** POST /api/auth/user-websites/:id/refresh — re-probe the category catalogue. */
  refreshWebsite: {
    method: 'POST',
    path: '/api/auth/user-websites/:id/refresh',
    pathParams: z.object({ id: z.string() }),
    body: z.object({}),
    responses: {
      200: userWebsiteResponseSchema,
      401: userWebsiteErrorSchema,
      404: userWebsiteErrorSchema,
      422: userWebsiteErrorSchema,
      500: userWebsiteErrorSchema,
    },
    summary: 'Refresh a website’s category catalogue',
  },

  /**
   * DELETE /api/auth/user-websites/:id — disconnect. Imported documents stay:
   * they belong to the notebooks now, not to the connection.
   */
  deleteWebsite: {
    method: 'DELETE',
    path: '/api/auth/user-websites/:id',
    pathParams: z.object({ id: z.string() }),
    responses: {
      200: z.object({ success: z.literal(true) }),
      401: userWebsiteErrorSchema,
      404: userWebsiteErrorSchema,
      500: userWebsiteErrorSchema,
    },
    summary: 'Disconnect a website from the account',
  },
});
