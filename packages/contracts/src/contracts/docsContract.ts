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
  collaborativeDocumentListSchema,
  permissionsListSchema,
  shareSettingsSchema,
  sharePermissionBodySchema,
  shareModeBodySchema,
  addGroupBodySchema,
  updateGroupBodySchema,
  chatThreadResponseSchema,
  createDocumentBodySchema,
  generateDocumentBodySchema,
  listDocumentsQuerySchema,
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

    /**
     * GET /api/docs/:id/chat-thread
     * Resolve the shared chat thread for a collaborative document. One thread
     * per doc, shared across all collaborators. Idempotent — repeated calls
     * return the same thread UUID.
     */
    getChatThread: {
      method: 'GET',
      path: '/api/docs/:id/chat-thread',
      pathParams: z.object({ id: z.string() }),
      responses: {
        200: chatThreadResponseSchema,
        401: docsErrorSchema,
        403: docsErrorSchema,
        404: docsErrorSchema,
        500: docsErrorSchema,
      },
      summary: 'Resolve the shared chat thread for a document',
    },

    /**
     * POST /api/docs
     * Create a new collaborative document. Owner is set to the calling user.
     */
    createDocument: {
      method: 'POST',
      path: '/api/docs',
      body: createDocumentBodySchema,
      responses: {
        201: collaborativeDocumentSchema,
        401: docsErrorSchema,
        500: docsErrorWithDetailsSchema,
      },
      summary: 'Create a new collaborative document',
    },

    /**
     * POST /api/docs/generate
     * Generate a document from an AI prompt. Returns the persisted doc.
     */
    generateDocument: {
      method: 'POST',
      path: '/api/docs/generate',
      body: generateDocumentBodySchema,
      responses: {
        201: collaborativeDocumentSchema,
        400: docsErrorSchema,
        401: docsErrorSchema,
        500: docsErrorWithDetailsSchema,
      },
      summary: 'Generate a document from an AI prompt',
    },

    /**
     * GET /api/docs?limit=N
     * List all documents the calling user has access to.
     */
    listDocuments: {
      method: 'GET',
      path: '/api/docs',
      query: listDocumentsQuerySchema,
      responses: {
        200: collaborativeDocumentListSchema,
        401: docsErrorSchema,
        500: docsErrorWithDetailsSchema,
      },
      summary: 'List all accessible documents',
    },

    /**
     * GET /api/docs/:id/share
     * Read share settings (is_public, share_permission, share_mode).
     * Owner only.
     */
    getShareSettings: {
      method: 'GET',
      path: '/api/docs/:id/share',
      pathParams: z.object({ id: z.string() }),
      responses: {
        200: shareSettingsSchema,
        401: docsErrorSchema,
        403: docsErrorSchema,
        404: docsErrorSchema,
        500: docsErrorSchema,
      },
      summary: 'Get share settings for a document',
    },

    /**
     * POST /api/docs/:id/share/enable
     * Enable public sharing (sets is_public + share_mode='public').
     * Owner only.
     */
    enableSharing: {
      method: 'POST',
      path: '/api/docs/:id/share/enable',
      pathParams: z.object({ id: z.string() }),
      body: c.noBody(),
      responses: {
        200: shareSettingsSchema,
        401: docsErrorSchema,
        403: docsErrorSchema,
        404: docsErrorSchema,
        500: docsErrorSchema,
      },
      summary: 'Enable public sharing for a document',
    },

    /**
     * PUT /api/docs/:id/share/permission
     * Update the share permission level (viewer/editor) for the public link.
     * Owner only.
     */
    setSharePermission: {
      method: 'PUT',
      path: '/api/docs/:id/share/permission',
      pathParams: z.object({ id: z.string() }),
      body: sharePermissionBodySchema,
      responses: {
        200: shareSettingsSchema,
        401: docsErrorSchema,
        403: docsErrorSchema,
        404: docsErrorSchema,
        500: docsErrorSchema,
      },
      summary: 'Update the share permission level',
    },

    /**
     * PUT /api/docs/:id/share/mode
     * Set the share mode (private/authenticated/public). Leaving authenticated
     * mode revokes auto-granted share-link permissions.
     * Owner only.
     */
    setShareMode: {
      method: 'PUT',
      path: '/api/docs/:id/share/mode',
      pathParams: z.object({ id: z.string() }),
      body: shareModeBodySchema,
      responses: {
        200: shareSettingsSchema,
        401: docsErrorSchema,
        403: docsErrorSchema,
        404: docsErrorSchema,
        500: docsErrorSchema,
      },
      summary: 'Set the share mode for a document',
    },
  },
  { pathPrefix: '' }
);
