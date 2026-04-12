/**
 * ts-rest contract for /api/docs (collaborative documents, permissions, sharing, group shares).
 *
 * Covers the validateBody routes from:
 *   - apps/api/routes/docs/documentController.ts    → GET /:id
 *   - apps/api/routes/docs/permissionsController.ts → GET /:id/permissions
 *   - apps/api/routes/docs/shareController.ts       → POST /:id/share/disable
 *   - apps/api/routes/docs/groupShareController.ts  → POST /:id/groups, PUT /:id/groups/:groupId
 *
 * All routes require authentication — `requireAuth` is applied at the prefix
 * in routes.ts before this contract is mounted.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  docsErrorSchema,
  docsErrorWithDetailsSchema,
  collaborativeDocumentSchema,
  permissionsListSchema,
  shareSettingsSchema,
  addGroupBodySchema,
  updateGroupBodySchema,
} from '../schemas/docs.js';

const c = initContract();

export const docsContract = c.router(
  {
    /**
     * GET /api/docs/:id
     * Get a specific document's metadata.
     * Requires read access (owner / direct permission / group share / public share).
     */
    getDocumentById: {
      method: 'GET',
      path: '/api/docs/:id',
      pathParams: z.object({ id: z.string() }),
      responses: {
        200: collaborativeDocumentSchema,
        401: docsErrorSchema,
        403: docsErrorSchema,
        404: docsErrorSchema,
        500: docsErrorWithDetailsSchema,
      },
      summary: 'Get document metadata by ID',
    },

    /**
     * GET /api/docs/:id/permissions
     * List all permissions (users + groups) for a document.
     * Requires at least read access to the document.
     */
    listPermissions: {
      method: 'GET',
      path: '/api/docs/:id/permissions',
      pathParams: z.object({ id: z.string() }),
      responses: {
        200: permissionsListSchema,
        401: docsErrorSchema,
        403: docsErrorSchema,
        404: docsErrorSchema,
        500: docsErrorWithDetailsSchema,
      },
      summary: 'List document permissions',
    },

    /**
     * POST /api/docs/:id/share/disable
     * Disable public sharing and remove share-link-granted permissions.
     * Owner only.
     */
    disableSharing: {
      method: 'POST',
      path: '/api/docs/:id/share/disable',
      pathParams: z.object({ id: z.string() }),
      body: c.noBody(),
      responses: {
        200: shareSettingsSchema,
        401: docsErrorSchema,
        500: docsErrorSchema,
      },
      summary: 'Disable public sharing for a document',
    },

    /**
     * POST /api/docs/:id/groups
     * Share a document with a group.
     * Owner + group member only.
     */
    addGroupShare: {
      method: 'POST',
      path: '/api/docs/:id/groups',
      pathParams: z.object({ id: z.string() }),
      body: addGroupBodySchema,
      responses: {
        201: z.object({ message: z.string() }),
        401: docsErrorSchema,
        403: docsErrorSchema,
        404: docsErrorSchema,
        409: docsErrorSchema,
        500: docsErrorWithDetailsSchema,
      },
      summary: 'Share document with a group',
    },

    /**
     * PUT /api/docs/:id/groups/:groupId
     * Update group permission level for a document.
     * Owner only.
     */
    updateGroupShare: {
      method: 'PUT',
      path: '/api/docs/:id/groups/:groupId',
      pathParams: z.object({ id: z.string(), groupId: z.string() }),
      body: updateGroupBodySchema,
      responses: {
        200: z.object({ message: z.string() }),
        401: docsErrorSchema,
        403: docsErrorSchema,
        404: docsErrorSchema,
        500: docsErrorWithDetailsSchema,
      },
      summary: 'Update group permission level for a document',
    },
  },
  { pathPrefix: '' }
);
