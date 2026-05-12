/**
 * ts-rest contract router for subtitler endpoints.
 *
 * Covers:
 *   POST /api/subtitler/cleanup/:uploadId
 *   POST /api/subtitler/export-token
 *   GET  /api/subtitler/projects
 *   GET  /api/subtitler/projects/:projectId
 *   POST /api/subtitler/projects
 *   PUT  /api/subtitler/projects/:projectId
 *   DELETE /api/subtitler/projects/:projectId
 *   POST /api/subtitler/projects/:projectId/export
 *
 * Mount BEFORE the legacy routers in routes.ts.
 * Project routes require authentication — `requireAuth` is applied at the
 * prefix in routes.ts. Processing routes (cleanup, export-token) do not
 * require auth at the prefix level.
 */

import { subtitlerContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { generateDownloadToken } from '../../services/subtitler/downloadUtils.js';
import { saveOrUpdateProject } from '../../services/subtitler/projectSavingService.js';
import { scheduleImmediateCleanup } from '../../services/subtitler/tusService.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { createLogger } from '../../utils/logger.js';
import { redisClient } from '../../utils/redis/index.js';

import type { SubtitlerProjectService } from '../../services/subtitler/ProjectService.js';
import type { UserProfile } from '../../services/user/types.js';
import type { Application, Request } from 'express';

const log = createLogger('subtitlerContractRouter');

function getUserId(req: Request): string | undefined {
  const user = req.user as UserProfile | undefined;
  return user?.id;
}

let _projectService: SubtitlerProjectService | null = null;

async function getProjectService(): Promise<SubtitlerProjectService> {
  if (!_projectService) {
    const { getSubtitlerProjectService } = await import('../../services/subtitler/index.js');
    _projectService = getSubtitlerProjectService();
    await _projectService.ensureInitialized();
  }
  return _projectService;
}

const s = initServer();

export const subtitlerContractRouter = s.router(subtitlerContract, {
  postCleanup: async (args) => {
    const { uploadId } = args.params;
    if (!uploadId) {
      return { status: 400 as const, body: { error: 'Upload-ID fehlt' } };
    }
    try {
      await redisClient.set(`cancel:${uploadId}`, 'true', { EX: 300 });
      void scheduleImmediateCleanup(uploadId, 'manual cleanup');
      return { status: 200 as const, body: { success: true } };
    } catch (e: unknown) {
      return {
        status: 500 as const,
        body: { error: e instanceof Error ? e.message : String(e) },
      };
    }
  },

  postExportToken: async (args) => {
    try {
      const { uploadId, subtitles, subtitlePreference, stylePreference, heightPreference } =
        args.body;
      const result = await generateDownloadToken({
        uploadId,
        subtitles,
        ...(subtitlePreference != null && { subtitlePreference }),
        ...(stylePreference != null && { stylePreference }),
        ...(heightPreference != null && { heightPreference }),
      });
      return { status: 200 as const, body: { success: true, ...result } };
    } catch (e: unknown) {
      return {
        status: 400 as const,
        body: { error: e instanceof Error ? e.message : String(e) },
      };
    }
  },

  listProjects: async (args) => {
    try {
      const userId = getUserId(args.req);
      if (!userId) {
        return { status: 401 as const, body: { error: 'Nicht authentifiziert' } };
      }
      const service = await getProjectService();
      const projects = await service.getUserProjects(userId);
      return { status: 200 as const, body: { success: true, projects } };
    } catch (error: unknown) {
      log.error('[subtitlerContract.listProjects] Error:', { error });
      return {
        status: 500 as const,
        body: { success: false, error: 'Projekte konnten nicht geladen werden' },
      };
    }
  },

  getProject: async (args) => {
    try {
      const userId = getUserId(args.req);
      if (!userId) {
        return { status: 401 as const, body: { error: 'Nicht authentifiziert' } };
      }
      const { projectId } = args.params;
      const service = await getProjectService();
      const project = await service.getProject(userId, projectId);
      return { status: 200 as const, body: { success: true, project } };
    } catch (error: unknown) {
      log.error('[subtitlerContract.getProject] Error:', { error });
      const errMsg = error instanceof Error ? error.message : String(error);
      if (errMsg.includes('not found')) {
        return {
          status: 404 as const,
          body: { success: false, error: 'Projekt nicht gefunden' },
        };
      }
      return {
        status: 500 as const,
        body: { success: false, error: 'Projekt konnte nicht geladen werden' },
      };
    }
  },

  createProject: async (args) => {
    try {
      const userId = getUserId(args.req);
      if (!userId) {
        return { status: 401 as const, body: { error: 'Nicht authentifiziert' } };
      }
      if (!args.body.uploadId) {
        return {
          status: 400 as const,
          body: { success: false, error: 'Upload-ID ist erforderlich' },
        };
      }
      const { project, isNew } = await saveOrUpdateProject(userId, args.body);
      const status = isNew ? (201 as const) : (200 as const);
      return { status, body: { success: true, project, isNew } };
    } catch (error: unknown) {
      log.error('[subtitlerContract.createProject] Error:', { error });
      return {
        status: 500 as const,
        body: {
          success: false,
          error:
            (error instanceof Error ? error.message : String(error)) ||
            'Projekt konnte nicht erstellt werden',
        },
      };
    }
  },

  updateProject: async (args) => {
    try {
      const userId = getUserId(args.req);
      if (!userId) {
        return { status: 401 as const, body: { error: 'Nicht authentifiziert' } };
      }
      const { projectId } = args.params;
      const service = await getProjectService();
      const project = await service.updateProject(userId, projectId, args.body);
      return { status: 200 as const, body: { success: true, project } };
    } catch (error: unknown) {
      log.error('[subtitlerContract.updateProject] Error:', { error });
      const errMsg = error instanceof Error ? error.message : String(error);
      if (errMsg.includes('not found') || errMsg.includes('access denied')) {
        return {
          status: 404 as const,
          body: { success: false, error: 'Projekt nicht gefunden' },
        };
      }
      return {
        status: 500 as const,
        body: { success: false, error: 'Projekt konnte nicht aktualisiert werden' },
      };
    }
  },

  deleteProject: async (args) => {
    try {
      const userId = getUserId(args.req);
      if (!userId) {
        return { status: 401 as const, body: { error: 'Nicht authentifiziert' } };
      }
      const { projectId } = args.params;
      const service = await getProjectService();
      await service.deleteProject(userId, projectId);
      return { status: 200 as const, body: { success: true } };
    } catch (error: unknown) {
      log.error('[subtitlerContract.deleteProject] Error:', { error });
      const errMsg = error instanceof Error ? error.message : String(error);
      if (errMsg.includes('not found')) {
        return {
          status: 404 as const,
          body: { success: false, error: 'Projekt nicht gefunden' },
        };
      }
      return {
        status: 500 as const,
        body: { success: false, error: 'Projekt konnte nicht gelöscht werden' },
      };
    }
  },

  trackExport: async (args) => {
    try {
      const userId = getUserId(args.req);
      if (!userId) {
        return { status: 401 as const, body: { error: 'Nicht authentifiziert' } };
      }
      const { projectId } = args.params;
      const service = await getProjectService();
      await service.incrementExportCount(userId, projectId);
      return { status: 200 as const, body: { success: true } };
    } catch (error: unknown) {
      log.error('[subtitlerContract.trackExport] Error:', { error });
      return {
        status: 500 as const,
        body: { success: false, error: 'Export konnte nicht getrackt werden' },
      };
    }
  },
});

/**
 * Mount the ts-rest subtitler contract router onto an Express app.
 * Call from routes.ts BEFORE the legacy subtitler routers.
 */
export function mountSubtitlerContractRouter(app: Application): void {
  createExpressEndpoints(subtitlerContract, subtitlerContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'subtitlerContract'),
  });
}
