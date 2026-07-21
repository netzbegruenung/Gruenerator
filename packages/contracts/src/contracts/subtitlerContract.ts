/**
 * ts-rest contract for subtitler endpoints — the full JSON surface.
 *
 * Covers every JSON boundary of the subtitler:
 *   apps/api/routes/subtitler/subtitlerContractRouter.ts (this contract's server)
 *   — processing (process, result, export, export-segments, process-auto,
 *     progress polling, cleanup, compression-status, export-token)
 *   — project CRUD + track-export
 *   — share management (create, from-project, list, public info, delete)
 *   — social-text generation
 *
 * Mount prefixes:
 *   /api/subtitler           (processing, export-token, share, social)
 *   /api/subtitler/projects  (project CRUD — all require auth)
 *   /api/subtitler/share     (share management)
 *
 * Left RAW (binary / multipart / streaming — ts-rest is JSON-only here):
 *   POST /upload, POST /upload-binary — video upload (TUS / raw stream)
 *   GET /download/:token — binary video
 *   GET /download-chunk/:uploadId/:chunkIndex — binary video
 *   GET /export-download/:exportToken — binary video
 *   GET /internal-video/:uploadId — binary video stream
 *   GET /auto-download/:uploadId — binary video stream
 *   GET /:projectId/video — binary video stream
 *   GET /:projectId/thumbnail — binary image
 *   GET /share/:shareToken/thumbnail — binary image
 *   GET /share/:shareToken/preview — binary video stream
 *   GET /share/:shareToken/download — binary video
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  exportTokenBodySchema,
  exportTokenResponseSchema,
  projectDataBodySchema,
  updateProjectBodySchema,
  projectListResponseSchema,
  projectSingleResponseSchema,
  projectCreateResponseSchema,
  projectUpdateResponseSchema,
  projectDeleteResponseSchema,
  projectExportTrackResponseSchema,
  subtitlerErrorResponseSchema,
  subtitlerSuccessErrorResponseSchema,
  processRequestSchema,
  processStartResponseSchema,
  resultQuerySchema,
  processResultResponseSchema,
  compressionStatusSchema,
  exportProgressSchema,
  exportRequestSchema,
  exportStartResponseSchema,
  exportSegmentsRequestSchema,
  exportSegmentsResponseSchema,
  autoProcessRequestSchema,
  autoProcessStartResponseSchema,
  autoProgressSchema,
  subtitlerNotFoundResponseSchema,
  createShareRequestSchema,
  createShareFromProjectRequestSchema,
  subtitlerCreateShareResponseSchema,
  subtitlerSharesListResponseSchema,
  sharePublicResponseSchema,
  sharePublicExpiredResponseSchema,
  subtitlerDeleteShareResponseSchema,
  generateSocialRequestSchema,
  generateSocialResponseSchema,
} from '../schemas/subtitler.js';

const c = initContract();

export const subtitlerContract = c.router(
  {
    // ── Processing ───────────────────────────────────────────────────────────

    /**
     * POST /api/subtitler/cleanup/:uploadId
     * Cancel processing and schedule immediate cleanup of an upload.
     * Also reachable via DELETE /api/subtitler/cleanup/:uploadId.
     */
    postCleanup: {
      method: 'POST',
      path: '/api/subtitler/cleanup/:uploadId',
      pathParams: z.object({ uploadId: z.string() }),
      body: c.noBody(),
      responses: {
        200: z.object({ success: z.boolean() }),
        400: subtitlerErrorResponseSchema,
        500: subtitlerErrorResponseSchema,
      },
      summary: 'Cancel processing and clean up an upload',
    },

    /**
     * POST /api/subtitler/export-token
     * Generate a download token for an exported video.
     */
    postExportToken: {
      method: 'POST',
      path: '/api/subtitler/export-token',
      body: exportTokenBodySchema,
      responses: {
        200: exportTokenResponseSchema,
        400: subtitlerErrorResponseSchema,
        500: subtitlerErrorResponseSchema,
      },
      summary: 'Generate a download token for an exported video',
    },

    // ── Projects ─────────────────────────────────────────────────────────────

    /**
     * GET /api/subtitler/projects
     * List all projects belonging to the authenticated user.
     */
    listProjects: {
      method: 'GET',
      path: '/api/subtitler/projects',
      responses: {
        200: projectListResponseSchema,
        401: subtitlerErrorResponseSchema,
        500: subtitlerSuccessErrorResponseSchema,
      },
      summary: 'List user subtitler projects',
    },

    /**
     * GET /api/subtitler/projects/:projectId
     * Get a single project by ID.
     */
    getProject: {
      method: 'GET',
      path: '/api/subtitler/projects/:projectId',
      pathParams: z.object({ projectId: z.string() }),
      responses: {
        200: projectSingleResponseSchema,
        401: subtitlerErrorResponseSchema,
        404: subtitlerSuccessErrorResponseSchema,
        500: subtitlerSuccessErrorResponseSchema,
      },
      summary: 'Get a single subtitler project',
    },

    /**
     * POST /api/subtitler/projects
     * Create or update a project.
     */
    createProject: {
      method: 'POST',
      path: '/api/subtitler/projects',
      body: projectDataBodySchema,
      responses: {
        200: projectCreateResponseSchema,
        201: projectCreateResponseSchema,
        400: subtitlerSuccessErrorResponseSchema,
        401: subtitlerErrorResponseSchema,
        500: subtitlerSuccessErrorResponseSchema,
      },
      summary: 'Create a subtitler project',
    },

    /**
     * PUT /api/subtitler/projects/:projectId
     * Update an existing project.
     */
    updateProject: {
      method: 'PUT',
      path: '/api/subtitler/projects/:projectId',
      pathParams: z.object({ projectId: z.string() }),
      body: updateProjectBodySchema,
      responses: {
        200: projectUpdateResponseSchema,
        401: subtitlerErrorResponseSchema,
        404: subtitlerSuccessErrorResponseSchema,
        500: subtitlerSuccessErrorResponseSchema,
      },
      summary: 'Update a subtitler project',
    },

    /**
     * DELETE /api/subtitler/projects/:projectId
     * Delete a project.
     */
    deleteProject: {
      method: 'DELETE',
      path: '/api/subtitler/projects/:projectId',
      pathParams: z.object({ projectId: z.string() }),
      body: c.noBody(),
      responses: {
        200: projectDeleteResponseSchema,
        401: subtitlerErrorResponseSchema,
        404: subtitlerSuccessErrorResponseSchema,
        500: subtitlerSuccessErrorResponseSchema,
      },
      summary: 'Delete a subtitler project',
    },

    /**
     * POST /api/subtitler/projects/:projectId/export
     * Increment the export count for a project (tracking only).
     */
    trackExport: {
      method: 'POST',
      path: '/api/subtitler/projects/:projectId/export',
      pathParams: z.object({ projectId: z.string() }),
      body: c.noBody(),
      responses: {
        200: projectExportTrackResponseSchema,
        401: subtitlerErrorResponseSchema,
        500: subtitlerSuccessErrorResponseSchema,
      },
      summary: 'Track an export for a subtitler project',
    },

    // ── Processing: transcription pipeline ───────────────────────────────────

    /** POST /api/subtitler/process — start transcription for an upload. */
    postProcess: {
      method: 'POST',
      path: '/api/subtitler/process',
      body: processRequestSchema,
      responses: {
        202: processStartResponseSchema,
        404: subtitlerErrorResponseSchema,
        500: subtitlerErrorResponseSchema,
      },
      summary: 'Start transcription for an upload',
    },

    /** GET /api/subtitler/result/:uploadId — poll transcription result. */
    getResult: {
      method: 'GET',
      path: '/api/subtitler/result/:uploadId',
      pathParams: z.object({ uploadId: z.string() }),
      query: resultQuerySchema,
      responses: {
        200: processResultResponseSchema,
        400: subtitlerErrorResponseSchema,
        404: subtitlerNotFoundResponseSchema,
        500: subtitlerErrorResponseSchema,
      },
      summary: 'Poll transcription result for an upload',
    },

    /** GET /api/subtitler/compression-status/:uploadId */
    getCompressionStatus: {
      method: 'GET',
      path: '/api/subtitler/compression-status/:uploadId',
      pathParams: z.object({ uploadId: z.string() }),
      responses: {
        200: compressionStatusSchema,
        500: subtitlerErrorResponseSchema,
      },
      summary: 'Get compression status for an upload',
    },

    // ── Processing: manual export lifecycle ──────────────────────────────────

    /** POST /api/subtitler/export — start a subtitled-video render. */
    postExport: {
      method: 'POST',
      path: '/api/subtitler/export',
      body: exportRequestSchema,
      responses: {
        202: exportStartResponseSchema,
        400: subtitlerErrorResponseSchema,
        404: subtitlerErrorResponseSchema,
        500: subtitlerErrorResponseSchema,
      },
      summary: 'Start a subtitled-video export render',
    },

    /** POST /api/subtitler/export-segments — start a trimmed-clip render. */
    postExportSegments: {
      method: 'POST',
      path: '/api/subtitler/export-segments',
      body: exportSegmentsRequestSchema,
      responses: {
        202: exportSegmentsResponseSchema,
        400: subtitlerErrorResponseSchema,
        404: subtitlerErrorResponseSchema,
        500: subtitlerErrorResponseSchema,
      },
      summary: 'Start a segment (trim/clip) export render',
    },

    /** GET /api/subtitler/export-progress/:exportToken — poll export render. */
    getExportProgress: {
      method: 'GET',
      path: '/api/subtitler/export-progress/:exportToken',
      pathParams: z.object({ exportToken: z.string() }),
      responses: {
        200: exportProgressSchema,
        404: subtitlerNotFoundResponseSchema,
        500: subtitlerErrorResponseSchema,
      },
      summary: 'Poll export render progress',
    },

    // ── Processing: auto (one-shot) pipeline ─────────────────────────────────

    /** POST /api/subtitler/process-auto — start the auto transcribe+render pipeline. */
    postProcessAuto: {
      method: 'POST',
      path: '/api/subtitler/process-auto',
      body: autoProcessRequestSchema,
      responses: {
        202: autoProcessStartResponseSchema,
        404: subtitlerErrorResponseSchema,
        500: subtitlerErrorResponseSchema,
      },
      summary: 'Start the auto transcribe + render pipeline',
    },

    /** GET /api/subtitler/auto-progress/:uploadId — poll the auto pipeline. */
    getAutoProgress: {
      method: 'GET',
      path: '/api/subtitler/auto-progress/:uploadId',
      pathParams: z.object({ uploadId: z.string() }),
      responses: {
        200: autoProgressSchema,
        404: subtitlerNotFoundResponseSchema,
        500: subtitlerErrorResponseSchema,
      },
      summary: 'Poll auto pipeline progress',
    },

    // ── Processing: cleanup (DELETE variant of postCleanup) ──────────────────

    /** DELETE /api/subtitler/cleanup/:uploadId — cancel + clean up an upload. */
    deleteCleanup: {
      method: 'DELETE',
      path: '/api/subtitler/cleanup/:uploadId',
      pathParams: z.object({ uploadId: z.string() }),
      body: c.noBody(),
      responses: {
        200: z.object({ success: z.boolean() }),
        400: subtitlerErrorResponseSchema,
        500: subtitlerErrorResponseSchema,
      },
      summary: 'Cancel processing and clean up an upload (DELETE variant)',
    },

    // ── Social ───────────────────────────────────────────────────────────────

    /** POST /api/subtitler/generate-social — generate social-media text. */
    generateSocial: {
      method: 'POST',
      path: '/api/subtitler/generate-social',
      body: generateSocialRequestSchema,
      responses: {
        200: generateSocialResponseSchema,
        400: subtitlerErrorResponseSchema,
        500: subtitlerErrorResponseSchema,
      },
      summary: 'Generate social-media text from subtitles',
    },

    // ── Share management ─────────────────────────────────────────────────────

    /** POST /api/subtitler/share — promote an export token to a share. */
    createShare: {
      method: 'POST',
      path: '/api/subtitler/share',
      body: createShareRequestSchema,
      responses: {
        200: subtitlerCreateShareResponseSchema,
        201: subtitlerCreateShareResponseSchema,
        400: subtitlerCreateShareResponseSchema,
        401: subtitlerErrorResponseSchema,
        500: subtitlerCreateShareResponseSchema,
      },
      summary: 'Create a share from an export token',
    },

    /** POST /api/subtitler/share/from-project — share a saved project. */
    createShareFromProject: {
      method: 'POST',
      path: '/api/subtitler/share/from-project',
      body: createShareFromProjectRequestSchema,
      responses: {
        200: subtitlerCreateShareResponseSchema,
        201: subtitlerCreateShareResponseSchema,
        400: subtitlerCreateShareResponseSchema,
        401: subtitlerErrorResponseSchema,
        500: subtitlerCreateShareResponseSchema,
      },
      summary: 'Create a share from a saved project',
    },

    /** GET /api/subtitler/share/my — list the authed user's shares. */
    listMyShares: {
      method: 'GET',
      path: '/api/subtitler/share/my',
      responses: {
        200: subtitlerSharesListResponseSchema,
        401: subtitlerErrorResponseSchema,
        500: subtitlerSuccessErrorResponseSchema,
      },
      summary: "List the authenticated user's shares",
    },

    /** GET /api/subtitler/share/:shareToken — public share info. */
    getShare: {
      method: 'GET',
      path: '/api/subtitler/share/:shareToken',
      pathParams: z.object({ shareToken: z.string() }),
      responses: {
        200: sharePublicResponseSchema,
        404: sharePublicResponseSchema,
        410: sharePublicExpiredResponseSchema,
        500: sharePublicResponseSchema,
      },
      summary: 'Get public info for a shared video',
    },

    /** DELETE /api/subtitler/share/:shareToken — delete a share. */
    deleteShare: {
      method: 'DELETE',
      path: '/api/subtitler/share/:shareToken',
      pathParams: z.object({ shareToken: z.string() }),
      body: c.noBody(),
      responses: {
        200: subtitlerDeleteShareResponseSchema,
        401: subtitlerErrorResponseSchema,
        404: subtitlerSuccessErrorResponseSchema,
        500: subtitlerSuccessErrorResponseSchema,
      },
      summary: 'Delete a share',
    },
  },
  { pathPrefix: '' }
);
