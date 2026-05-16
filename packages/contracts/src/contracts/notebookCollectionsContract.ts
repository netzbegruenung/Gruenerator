/**
 * ts-rest contract for /api/auth/notebook-collections (CRUD routes).
 *
 * Covers the 10 endpoints in apps/api/routes/notebook/collectionsController.ts.
 * All routes require authentication — auth is enforced at the prefix via
 * `requireAuth` middleware in routes.ts before this contract is mounted.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { notebookErrorResponseSchema } from '../schemas/notebook.js';
import {
  createCollectionBodySchema,
  updateCollectionBodySchema,
  bulkDeleteBodySchema,
  collectionsListResponseSchema,
  createCollectionResponseSchema,
  updateCollectionResponseSchema,
  syncCollectionResponseSchema,
  searchResultItemSchema,
  simpleSuccessMessageSchema,
  bulkDeleteResponseSchema,
  likeCollectionResponseSchema,
  unlikeCollectionResponseSchema,
  listMyLikedCollectionsResponseSchema,
} from '../schemas/notebookCollections.js';

const c = initContract();

export const notebookCollectionsContract = c.router(
  {
    /**
     * GET /api/auth/notebook-collections
     * List the authenticated user's notebook collections.
     */
    listCollections: {
      method: 'GET',
      path: '/api/auth/notebook-collections',
      responses: {
        200: collectionsListResponseSchema,
        401: notebookErrorResponseSchema,
        500: notebookErrorResponseSchema,
      },
      summary: 'List user notebook collections',
    },

    /**
     * GET /api/auth/notebook-collections/public
     * List all notebook collections marked is_public=true across all users.
     * Powers the "Von der Basis" section on /notebooks.
     */
    listPublicCollections: {
      method: 'GET',
      path: '/api/auth/notebook-collections/public',
      responses: {
        200: collectionsListResponseSchema,
        401: notebookErrorResponseSchema,
        500: notebookErrorResponseSchema,
      },
      summary: 'List publicly published notebook collections',
    },

    /**
     * POST /api/auth/notebook-collections
     * Create a new notebook collection.
     */
    createCollection: {
      method: 'POST',
      path: '/api/auth/notebook-collections',
      body: createCollectionBodySchema,
      responses: {
        201: createCollectionResponseSchema,
        400: notebookErrorResponseSchema,
        401: notebookErrorResponseSchema,
        403: notebookErrorResponseSchema,
        500: notebookErrorResponseSchema,
      },
      summary: 'Create a new notebook collection',
    },

    /**
     * PUT /api/auth/notebook-collections/:id
     * Update an existing notebook collection.
     */
    updateCollection: {
      method: 'PUT',
      path: '/api/auth/notebook-collections/:id',
      pathParams: z.object({ id: z.string() }),
      body: updateCollectionBodySchema,
      responses: {
        200: updateCollectionResponseSchema,
        400: notebookErrorResponseSchema,
        401: notebookErrorResponseSchema,
        403: notebookErrorResponseSchema,
        404: notebookErrorResponseSchema,
        500: notebookErrorResponseSchema,
      },
      summary: 'Update a notebook collection',
    },

    /**
     * POST /api/auth/notebook-collections/:id/sync
     * Sync a Wolke-based collection with its current documents.
     */
    syncCollection: {
      method: 'POST',
      path: '/api/auth/notebook-collections/:id/sync',
      pathParams: z.object({ id: z.string() }),
      body: c.noBody(),
      responses: {
        200: syncCollectionResponseSchema,
        400: notebookErrorResponseSchema,
        401: notebookErrorResponseSchema,
        403: notebookErrorResponseSchema,
        404: notebookErrorResponseSchema,
        500: notebookErrorResponseSchema,
      },
      summary: 'Sync a Wolke-based notebook collection',
    },

    /**
     * GET /api/auth/notebook-collections/:id/search?q=...
     * Search documents within a specific collection.
     * Returns an array (not a wrapped object).
     */
    searchCollection: {
      method: 'GET',
      path: '/api/auth/notebook-collections/:id/search',
      pathParams: z.object({ id: z.string() }),
      query: z.object({ q: z.string() }),
      responses: {
        200: z.array(searchResultItemSchema),
        400: notebookErrorResponseSchema,
        401: notebookErrorResponseSchema,
        404: notebookErrorResponseSchema,
        500: notebookErrorResponseSchema,
      },
      summary: 'Search documents within a notebook collection',
    },

    /**
     * DELETE /api/auth/notebook-collections/:id
     * Delete a notebook collection.
     */
    deleteCollection: {
      method: 'DELETE',
      path: '/api/auth/notebook-collections/:id',
      pathParams: z.object({ id: z.string() }),
      body: c.noBody(),
      responses: {
        200: simpleSuccessMessageSchema,
        401: notebookErrorResponseSchema,
        404: notebookErrorResponseSchema,
        500: notebookErrorResponseSchema,
      },
      summary: 'Delete a notebook collection',
    },

    /**
     * DELETE /api/auth/notebook-collections/:id/documents/:documentId
     * Remove a single document from a collection.
     */
    removeDocument: {
      method: 'DELETE',
      path: '/api/auth/notebook-collections/:id/documents/:documentId',
      pathParams: z.object({ id: z.string(), documentId: z.string() }),
      body: c.noBody(),
      responses: {
        200: simpleSuccessMessageSchema,
        401: notebookErrorResponseSchema,
        404: notebookErrorResponseSchema,
        500: notebookErrorResponseSchema,
      },
      summary: 'Remove a document from a notebook collection',
    },

    /**
     * DELETE /api/auth/notebook-collections/bulk
     * Bulk delete notebook collections by ID array.
     */
    bulkDelete: {
      method: 'DELETE',
      path: '/api/auth/notebook-collections/bulk',
      body: bulkDeleteBodySchema,
      responses: {
        200: bulkDeleteResponseSchema,
        400: notebookErrorResponseSchema,
        401: notebookErrorResponseSchema,
        500: notebookErrorResponseSchema,
      },
      summary: 'Bulk delete notebook collections',
    },

    /**
     * GET /api/auth/notebook-collections/likes
     * Return the IDs of public notebooks the authenticated user has liked.
     * Kept separate from listPublicCollections so the public listing stays
     * user-agnostic and cacheable.
     */
    listMyLikedCollections: {
      method: 'GET',
      path: '/api/auth/notebook-collections/likes',
      responses: {
        200: listMyLikedCollectionsResponseSchema,
        401: notebookErrorResponseSchema,
        500: notebookErrorResponseSchema,
      },
      summary: "List the authenticated user's liked notebook IDs",
    },

    /**
     * POST /api/auth/notebook-collections/:id/like
     * Like a public notebook collection. Idempotent; only fresh likes
     * trigger a notification to the notebook owner (and never if owner === self).
     */
    likeCollection: {
      method: 'POST',
      path: '/api/auth/notebook-collections/:id/like',
      pathParams: z.object({ id: z.string() }),
      body: c.noBody(),
      responses: {
        200: likeCollectionResponseSchema,
        401: notebookErrorResponseSchema,
        404: notebookErrorResponseSchema,
        500: notebookErrorResponseSchema,
      },
      summary: 'Like a public notebook collection',
    },

    /**
     * DELETE /api/auth/notebook-collections/:id/like
     * Remove the authenticated user's like from a notebook collection.
     */
    unlikeCollection: {
      method: 'DELETE',
      path: '/api/auth/notebook-collections/:id/like',
      pathParams: z.object({ id: z.string() }),
      body: c.noBody(),
      responses: {
        200: unlikeCollectionResponseSchema,
        401: notebookErrorResponseSchema,
        404: notebookErrorResponseSchema,
        500: notebookErrorResponseSchema,
      },
      summary: 'Unlike a notebook collection',
    },
  },
  { pathPrefix: '' }
);
