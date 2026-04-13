/**
 * ts-rest contract for WordPress integration endpoints.
 *
 * Covers the validateBody-guarded endpoints in:
 * - apps/api/routes/wordpress/wordpressApi.ts
 *
 * All routes require authentication (router.use(requireAuth) in the source).
 *
 * Response bodies for external WordPress REST API v2 data use z.unknown()
 * with inline comments. Validation of external shapes is Phase 4.3 (done)
 * in apps/api/services/api-clients/wordpressApiClient.ts.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  connectSiteBodySchema,
  connectSiteResponseSchema,
  updateSiteBodySchema,
  updateSiteResponseSchema,
  testConnectionBodySchema,
  testConnectionResponseSchema,
  publishPostBodySchema,
  publishPostResponseSchema,
  updatePostBodySchema,
  updatePostResponseSchema,
  wordpressErrorSchema,
} from '../schemas/wordpress.js';

const c = initContract();

export const wordpressContract = c.router(
  {
    /**
     * POST /api/wordpress/sites
     * Connect a new WordPress site by storing credentials and testing the
     * connection.
     */
    connectSite: {
      method: 'POST',
      path: '/api/wordpress/sites',
      body: connectSiteBodySchema,
      responses: {
        201: connectSiteResponseSchema,
        400: wordpressErrorSchema,
        401: wordpressErrorSchema,
        409: z.object({ error: z.string(), message: z.string() }),
        500: wordpressErrorSchema,
      },
      summary: 'Connect a WordPress site',
    },

    /**
     * PUT /api/wordpress/sites/:id
     * Update label, active state or credentials for a connected site.
     */
    updateSite: {
      method: 'PUT',
      path: '/api/wordpress/sites/:id',
      pathParams: z.object({ id: z.string() }),
      body: updateSiteBodySchema,
      responses: {
        200: updateSiteResponseSchema,
        400: wordpressErrorSchema,
        401: wordpressErrorSchema,
        404: wordpressErrorSchema,
        500: wordpressErrorSchema,
      },
      summary: 'Update a connected WordPress site',
    },

    /**
     * POST /api/wordpress/test-connection
     * Test connectivity to a WordPress site without saving credentials.
     */
    testConnection: {
      method: 'POST',
      path: '/api/wordpress/test-connection',
      body: testConnectionBodySchema,
      responses: {
        200: testConnectionResponseSchema, // external: WordPress REST API v2 response
        400: wordpressErrorSchema,
        401: wordpressErrorSchema,
        500: wordpressErrorSchema,
      },
      summary: 'Test a WordPress site connection',
    },

    /**
     * POST /api/wordpress/publish
     * Create a new post on a connected WordPress site.
     */
    publishPost: {
      method: 'POST',
      path: '/api/wordpress/publish',
      body: publishPostBodySchema,
      responses: {
        200: publishPostResponseSchema,
        400: wordpressErrorSchema,
        401: wordpressErrorSchema,
        404: wordpressErrorSchema,
        500: wordpressErrorSchema,
      },
      summary: 'Publish a post to a WordPress site',
    },

    /**
     * PUT /api/wordpress/sites/:id/posts/:postId
     * Update an existing post on a connected WordPress site.
     */
    updatePost: {
      method: 'PUT',
      path: '/api/wordpress/sites/:id/posts/:postId',
      pathParams: z.object({ id: z.string(), postId: z.string() }),
      body: updatePostBodySchema,
      responses: {
        200: updatePostResponseSchema,
        400: wordpressErrorSchema,
        401: wordpressErrorSchema,
        404: wordpressErrorSchema,
        500: wordpressErrorSchema,
      },
      summary: 'Update a WordPress post',
    },
  },
  { pathPrefix: '' }
);
