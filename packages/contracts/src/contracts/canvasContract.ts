/**
 * ts-rest contract for canvas-document CRUD (`/api/canvas`).
 *
 * Covers the routes from apps/api/routes/canvas/canvasContractRouter.ts.
 * All routes require authentication (requireAuth is applied at the /api/canvas
 * prefix in routes.ts).
 *
 * Route ordering: `resize` and `clone` are literal sub-paths under `:id`
 * (POST /:id/resize, POST /:id/clone), distinct from `get`/`update`/`remove`
 * which share the `:id` param. The AI-suggest and chat-edit routers are mounted
 * earlier in routes.ts, so `/api/canvas/ai-suggest` matches before `get`.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  canvasCloneResponseSchema,
  canvasDocumentSchema,
  canvasErrorResponseSchema,
  canvasListResponseSchema,
  canvasMessageResponseSchema,
  canvasResizeResponseSchema,
  canvasRestoreResponseSchema,
  canvasStateResponseSchema,
  canvasFromVariantBodySchema,
  canvasFromVariantResponseSchema,
  canvasVersionListResponseSchema,
  canvasVersionResponseSchema,
  createCanvasBodySchema,
  resizeCanvasBodySchema,
  updateCanvasBodySchema,
} from '../schemas/canvas.js';

const c = initContract();

export const canvasContract = c.router(
  {
    /** GET /api/canvas — canvases owned by, shared with, or group-shared to the caller. */
    list: {
      method: 'GET',
      path: '/api/canvas',
      responses: {
        200: canvasListResponseSchema,
        401: canvasErrorResponseSchema,
        500: canvasErrorResponseSchema,
      },
      summary: 'List the current user canvases',
    },

    /** POST /api/canvas — create a canvas (collaborative_documents + sidecar). */
    create: {
      method: 'POST',
      path: '/api/canvas',
      body: createCanvasBodySchema,
      responses: {
        201: canvasDocumentSchema,
        401: canvasErrorResponseSchema,
        500: canvasErrorResponseSchema,
      },
      summary: 'Create a canvas',
    },

    /** POST /api/canvas/from-variant — server-authoritative mint of a chat sharepic variant. */
    fromVariant: {
      method: 'POST',
      path: '/api/canvas/from-variant',
      body: canvasFromVariantBodySchema,
      responses: {
        201: canvasFromVariantResponseSchema,
        400: canvasErrorResponseSchema,
        401: canvasErrorResponseSchema,
        500: canvasErrorResponseSchema,
      },
      summary: 'Mint a canvas from an unminted chat sharepic variant',
    },

    /** POST /api/canvas/:id/resize — duplicate into a new format. */
    resize: {
      method: 'POST',
      path: '/api/canvas/:id/resize',
      pathParams: z.object({ id: z.string() }),
      body: resizeCanvasBodySchema,
      responses: {
        201: canvasResizeResponseSchema,
        400: canvasErrorResponseSchema,
        401: canvasErrorResponseSchema,
        403: canvasErrorResponseSchema,
        404: canvasErrorResponseSchema,
        500: canvasErrorResponseSchema,
      },
      summary: 'Duplicate a canvas with a new output format',
    },

    /** POST /api/canvas/:id/clone — deep-copy a canvas the caller can read. */
    clone: {
      method: 'POST',
      path: '/api/canvas/:id/clone',
      pathParams: z.object({ id: z.string() }),
      body: z.object({}).optional(),
      responses: {
        201: canvasCloneResponseSchema,
        401: canvasErrorResponseSchema,
        403: canvasErrorResponseSchema,
        404: canvasErrorResponseSchema,
        500: canvasErrorResponseSchema,
      },
      summary: 'Clone a canvas',
    },

    /** GET /api/canvas/:id/state — current merged state (Yjs-aware). */
    getState: {
      method: 'GET',
      path: '/api/canvas/:id/state',
      pathParams: z.object({ id: z.string() }),
      responses: {
        200: canvasStateResponseSchema,
        401: canvasErrorResponseSchema,
        403: canvasErrorResponseSchema,
        404: canvasErrorResponseSchema,
        500: canvasErrorResponseSchema,
      },
      summary: 'Get the current canvas state (live Yjs or initial_state fallback)',
    },

    /** GET /api/canvas/:id/versions — chat-edit version history (newest first). */
    listVersions: {
      method: 'GET',
      path: '/api/canvas/:id/versions',
      pathParams: z.object({ id: z.string() }),
      responses: {
        200: canvasVersionListResponseSchema,
        401: canvasErrorResponseSchema,
        403: canvasErrorResponseSchema,
        404: canvasErrorResponseSchema,
        500: canvasErrorResponseSchema,
      },
      summary: 'List chat-edit state versions of a canvas',
    },

    /** GET /api/canvas/:id/versions/:version — one version snapshot. */
    getVersion: {
      method: 'GET',
      path: '/api/canvas/:id/versions/:version',
      pathParams: z.object({ id: z.string(), version: z.coerce.number().int() }),
      responses: {
        200: canvasVersionResponseSchema,
        401: canvasErrorResponseSchema,
        403: canvasErrorResponseSchema,
        404: canvasErrorResponseSchema,
        500: canvasErrorResponseSchema,
      },
      summary: 'Get a single canvas state version',
    },

    /** POST /api/canvas/:id/versions/:version/restore — re-apply as new version. */
    restoreVersion: {
      method: 'POST',
      path: '/api/canvas/:id/versions/:version/restore',
      pathParams: z.object({ id: z.string(), version: z.coerce.number().int() }),
      body: z.object({}).optional(),
      responses: {
        200: canvasRestoreResponseSchema,
        401: canvasErrorResponseSchema,
        403: canvasErrorResponseSchema,
        404: canvasErrorResponseSchema,
        500: canvasErrorResponseSchema,
      },
      summary: 'Restore a canvas state version (applied as a new version)',
    },

    /** GET /api/canvas/:id — a single canvas the caller can access. */
    get: {
      method: 'GET',
      path: '/api/canvas/:id',
      pathParams: z.object({ id: z.string() }),
      responses: {
        200: canvasDocumentSchema,
        401: canvasErrorResponseSchema,
        403: canvasErrorResponseSchema,
        404: canvasErrorResponseSchema,
        500: canvasErrorResponseSchema,
      },
      summary: 'Get a single canvas',
    },

    /** PATCH /api/canvas/:id — update title / thumbnail / page_count / format. */
    update: {
      method: 'PATCH',
      path: '/api/canvas/:id',
      pathParams: z.object({ id: z.string() }),
      body: updateCanvasBodySchema,
      responses: {
        200: canvasMessageResponseSchema,
        401: canvasErrorResponseSchema,
        403: canvasErrorResponseSchema,
        404: canvasErrorResponseSchema,
        500: canvasErrorResponseSchema,
      },
      summary: 'Update a canvas',
    },

    /** DELETE /api/canvas/:id — soft-delete (owners only). */
    remove: {
      method: 'DELETE',
      path: '/api/canvas/:id',
      pathParams: z.object({ id: z.string() }),
      responses: {
        200: canvasMessageResponseSchema,
        401: canvasErrorResponseSchema,
        403: canvasErrorResponseSchema,
        404: canvasErrorResponseSchema,
        500: canvasErrorResponseSchema,
      },
      summary: 'Delete a canvas',
    },
  },
  { pathPrefix: '' }
);
