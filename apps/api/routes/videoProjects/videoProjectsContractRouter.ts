/**
 * ts-rest contract router for video editor projects (`/api/video-projects`).
 *
 * requireAuth + authenticatedReadLimiter are applied at the prefix in routes.ts
 * (createExpressEndpoints registers handlers directly on the app, so the
 * prefix middleware must run first).
 */

import { videoProjectsContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import {
  createVideoProject,
  deleteVideoProject,
  listVideoProjects,
  resolveVideoProject,
  updateVideoProject,
} from '../../services/videoProjects/videoProjectRepository.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';

import type { Application } from 'express';

const log = createLogger('videoProjectsContractRouter');

const s = initServer();

export const videoProjectsContractRouter = s.router(videoProjectsContract, {
  list: async (args) => {
    try {
      const projects = await listVideoProjects(getAuthedUser(args.req).id);
      return { status: 200 as const, body: projects };
    } catch (error) {
      log.error('[videoProjects.list] Error:', error as Error);
      return { status: 500 as const, body: { error: 'Failed to list video projects' } };
    }
  },

  create: async (args) => {
    try {
      const result = await createVideoProject(getAuthedUser(args.req).id, args.body);
      return { status: 201 as const, body: result };
    } catch (error) {
      log.error('[videoProjects.create] Error:', error as Error);
      return { status: 500 as const, body: { error: 'Failed to create video project' } };
    }
  },

  get: async (args) => {
    try {
      const project = await resolveVideoProject(args.params.ref, getAuthedUser(args.req).id);
      if (!project) return { status: 404 as const, body: { error: 'Video project not found' } };
      return { status: 200 as const, body: project };
    } catch (error) {
      log.error('[videoProjects.get] Error:', error as Error);
      return { status: 500 as const, body: { error: 'Failed to load video project' } };
    }
  },

  update: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const result = await updateVideoProject(args.params.id, userId, args.body);
      if (result.kind === 'not_found') {
        return { status: 404 as const, body: { error: 'Video project not found' } };
      }
      if (result.kind === 'forbidden') {
        return { status: 403 as const, body: { error: 'Insufficient permissions' } };
      }
      const project = await resolveVideoProject(args.params.id, userId);
      if (!project) return { status: 404 as const, body: { error: 'Video project not found' } };
      return { status: 200 as const, body: project };
    } catch (error) {
      log.error('[videoProjects.update] Error:', error as Error);
      return { status: 500 as const, body: { error: 'Failed to update video project' } };
    }
  },

  delete: async (args) => {
    try {
      const result = await deleteVideoProject(args.params.id, getAuthedUser(args.req).id);
      if (result.kind === 'not_found') {
        return { status: 404 as const, body: { error: 'Video project not found' } };
      }
      if (result.kind === 'forbidden') {
        return { status: 403 as const, body: { error: 'Only owners can delete video projects' } };
      }
      return { status: 200 as const, body: { trashed: true as const } };
    } catch (error) {
      log.error('[videoProjects.delete] Error:', error as Error);
      return { status: 500 as const, body: { error: 'Failed to delete video project' } };
    }
  },
});

/** Mount the video-project CRUD contract router. requireAuth is applied at the prefix. */
export function mountVideoProjectsContractRouter(app: Application): void {
  createExpressEndpoints(videoProjectsContract, videoProjectsContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'videoProjectsContract'),
  });
}
