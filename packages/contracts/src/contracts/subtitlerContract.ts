/**
 * ts-rest contract for subtitler endpoints.
 *
 * Covers:
 *   apps/api/routes/subtitler/processingController.ts — cleanup route
 *   apps/api/routes/subtitler/projectController.ts — full project CRUD
 *
 * Mount prefixes:
 *   /api/subtitler  (processing: cleanup, export-token)
 *   /api/subtitler/projects  (project CRUD — all require auth)
 *
 * Skipped routes (binary / multipart):
 *   POST /export — returns 202 then streams via exportToken (binary video)
 *   POST /export-segments — same pattern
 *   POST /process-auto — large video pipeline, not JSON
 *   GET /download/:token — binary video
 *   GET /download-chunk/:uploadId/:chunkIndex — binary video
 *   GET /export-download/:exportToken — binary video
 *   GET /internal-video/:uploadId — binary video stream
 *   GET /auto-download/:uploadId — binary video stream
 *   GET /:projectId/video — binary video stream
 *   GET /:projectId/thumbnail — binary image
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
  },
  { pathPrefix: '' }
);
