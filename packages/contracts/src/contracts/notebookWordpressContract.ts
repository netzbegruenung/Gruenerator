/**
 * ts-rest contract for the notebook WordPress-source endpoints.
 *
 * User-scoped (not notebook-scoped): imports create user-owned documents with
 * status 'uploaded' that are attached to a notebook at save time — the same
 * upload-first pattern as manual uploads and Wolke imports. Mounted on a
 * dedicated prefix to stay clear of the `/:slugOrId` catch-all on
 * notebookCollectionsContract; auth via `requireAuth` at the prefix.
 */
import { initContract } from '@ts-rest/core';

import {
  wpDiscoverBodySchema,
  wpDiscoverResponseSchema,
  wpImportBodySchema,
  wpImportResponseSchema,
  wpErrorResponseSchema,
} from '../schemas/notebookWordpress.js';

const c = initContract();

export const notebookWordpressContract = c.router({
  /**
   * POST /api/auth/notebook-wordpress/discover
   * Probe a site's WP REST API and return its post categories with counts.
   * 422 = reachable but not a usable WordPress REST API.
   */
  discoverSite: {
    method: 'POST',
    path: '/api/auth/notebook-wordpress/discover',
    body: wpDiscoverBodySchema,
    responses: {
      200: wpDiscoverResponseSchema,
      400: wpErrorResponseSchema,
      401: wpErrorResponseSchema,
      422: wpErrorResponseSchema,
      500: wpErrorResponseSchema,
    },
    summary: 'Discover categories of a WordPress site',
  },

  /**
   * POST /api/auth/notebook-wordpress/import
   * Fetch posts for the selected scopes and create/update user-owned documents.
   * Full runs (no modified_after) also compute removals vs known_document_ids.
   */
  importSite: {
    method: 'POST',
    path: '/api/auth/notebook-wordpress/import',
    body: wpImportBodySchema,
    responses: {
      200: wpImportResponseSchema,
      400: wpErrorResponseSchema,
      401: wpErrorResponseSchema,
      422: wpErrorResponseSchema,
      500: wpErrorResponseSchema,
    },
    summary: 'Import posts from a WordPress site as notebook documents',
  },
});
