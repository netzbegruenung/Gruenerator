/**
 * ts-rest contract router for /api/share (write endpoints only)
 *
 * Covers the six validateBody-guarded routes from shareController.ts:
 *   POST /api/share/image
 *   POST /api/share/video
 *   POST /api/share/video/from-project
 *   PUT  /api/share/:shareToken/image
 *   POST /api/share/:shareToken/save-as-template
 *   POST /api/share/push-to-phone
 *
 * File-streaming routes (preview, download, thumbnail, original) and
 * read-only GET routes are left in the legacy Express router.
 *
 * Mount this BEFORE the legacy shareRouter in routes.ts so ts-rest
 * matches first; unmatched paths fall through to the legacy router.
 *
 * Usage in routes.ts:
 *   const { mountShareContractRouter } = await import('./routes/share/shareContractRouter.js');
 *   mountShareContractRouter(app);
 */

import { sharesContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { createLogger } from '../../utils/logger.js';
import { parseJSON } from '../../utils/parseJSON.js';
import { redisClient } from '../../utils/redis/index.js';

import type { UserProfile } from '../../services/user/types.js';
import type { Application, Request } from 'express';

const log = createLogger('sharesContract');

/**
 * 401 response for unauthenticated requests to auth-required contract handlers.
 *
 * Background: this router can't use prefix-level `requireAuth` because the
 * legacy `/api/share` router (mounted at routes.ts:459 with `publicReadLimiter`)
 * serves public read endpoints (preview/download/thumbnail) that must remain
 * reachable without a session. The per-handler guards below protect the six
 * write endpoints modeled by this contract.
 */
const UNAUTHORIZED = {
  status: 401 as const,
  body: { success: false as const, error: 'Authentication required' },
};

function getUserId(req: Request): string | undefined {
  return (req.user as UserProfile | undefined)?.id;
}

function getUserInfo(req: Request): { id: string; displayName: string } | undefined {
  const user = req.user as UserProfile | undefined;
  if (!user) return undefined;
  return {
    id: user.id,
    displayName: user.display_name || user.email || 'Anonymous',
  };
}

// ── Lazy-loaded services ────────────────────────────────────────────────────

interface ExportData {
  status: string;
  outputPath: string;
  duration?: number;
}

interface ShareResult {
  id: string;
  shareToken: string;
  shareUrl: string;
  createdAt: Date | string;
  mediaType: 'image' | 'video';
  hasOriginalImage?: boolean;
  status?: string;
}

interface SharedMediaService {
  ensureInitialized(): Promise<void>;
  createImageShare(userId: string, params: CreateImageShareParams): Promise<ShareResult>;
  createVideoShare(userId: string, params: CreateVideoShareParams): Promise<ShareResult>;
  createPendingVideoShare(
    userId: string,
    params: CreatePendingVideoShareParams
  ): Promise<ShareResult>;
  getShareByToken(shareToken: string): Promise<SharedMediaRow | null>;
  updateImageShare(
    userId: string,
    shareToken: string,
    params: UpdateImageShareParams
  ): Promise<ShareResult>;
  markAsTemplate(
    userId: string,
    shareToken: string,
    title: string,
    visibility: string,
    userName: string
  ): Promise<void>;
  getThumbnailPath?(relativePath: string): string;
  getSubtitledVideoPath?(relativePath: string): string;
  updateSubtitledVideoPath?(userId: string, projectId: string, relativePath: string): Promise<void>;
  finalizeVideoShare?(shareToken: string, videoPath: string): Promise<void>;
  markShareFailed?(shareToken: string): Promise<void>;
}

interface SharedMediaRow {
  id: string;
  user_id: string;
  share_token: string;
  media_type: string;
  title: string | null;
  file_path: string | null;
  thumbnail_path: string | null;
  status: string | null;
  created_at: Date;
  [key: string]: unknown;
}

interface CreateImageShareParams {
  imageBase64: string;
  title: string;
  imageType: string | null;
  metadata: Record<string, unknown>;
  originalImage: string | null;
  status?: 'ready' | 'draft';
}

interface CreateVideoShareParams {
  videoPath: string;
  title: string;
  thumbnailPath: string | null;
  duration: number | null;
  projectId: string | null;
}

interface CreatePendingVideoShareParams {
  title: string;
  thumbnailPath: string | null;
  duration: number | null;
  projectId: string;
}

interface UpdateImageShareParams {
  imageBase64: string;
  title?: string;
  metadata: Record<string, unknown>;
  originalImage?: string | null;
}

interface ProjectService {
  ensureInitialized(): Promise<void>;
  getProject(userId: string, projectId: string): Promise<Project>;
  getVideoPath(relativePath: string): string;
  getSubtitledVideoPath(relativePath: string): string;
  getThumbnailPath(relativePath: string): string;
  updateSubtitledVideoPath(userId: string, projectId: string, relativePath: string): Promise<void>;
}

interface Project {
  id?: string;
  video_path?: string;
  thumbnail_path?: string;
  subtitled_video_path?: string;
  subtitles?: unknown;
  title?: string;
  video_metadata?: { width?: number; height?: number; duration?: number };
  style_preference?: string;
  height_preference?: string;
}

let sharedMediaServiceInstance: SharedMediaService | null = null;
let projectServiceInstance: ProjectService | null = null;

async function getSharedMediaService(): Promise<SharedMediaService> {
  if (!sharedMediaServiceInstance) {
    const { getSharedMediaService: getService } =
      await import('../../services/sharedMediaService.js');
    sharedMediaServiceInstance = getService() as unknown as SharedMediaService;
    await sharedMediaServiceInstance.ensureInitialized();
  }
  return sharedMediaServiceInstance;
}

async function getProjectService(): Promise<ProjectService> {
  if (!projectServiceInstance) {
    const { getSubtitlerProjectService } = await import('../../services/subtitler/index.js');
    projectServiceInstance = getSubtitlerProjectService() as unknown as ProjectService;
    await projectServiceInstance.ensureInitialized();
  }
  return projectServiceInstance;
}

async function triggerBackgroundRender(
  userId: string,
  projectId: string,
  shareToken: string,
  project: Project
): Promise<void> {
  try {
    const { promises: fsPromises } = await import('fs');
    const { default: path } = await import('path');

    const projService = await getProjectService();
    const { processProjectExport } = await import('../../services/subtitler/exportService.js');

    log.info(`Background render starting for share ${shareToken}`);

    const result = await processProjectExport(
      project as {
        id: string;
        video_path: string;
        subtitles: string;
        style_preference?: string;
        height_preference?: string;
      },
      projService
    );

    const subtitledVideoRelativePath = `${userId}/${projectId}/subtitled_${Date.now()}.mp4`;
    const subtitledVideoFullPath = projService.getSubtitledVideoPath(subtitledVideoRelativePath);

    await fsPromises.mkdir(path.dirname(subtitledVideoFullPath), { recursive: true });
    await fsPromises.copyFile(result.outputPath, subtitledVideoFullPath);
    await projService.updateSubtitledVideoPath(userId, projectId, subtitledVideoRelativePath);

    const service = await getSharedMediaService();
    await service.finalizeVideoShare!(shareToken, subtitledVideoFullPath);

    try {
      await fsPromises.unlink(result.outputPath);
    } catch {
      // Ignore cleanup errors
    }

    log.info(`Background render complete for share ${shareToken}`);
  } catch (error) {
    log.error(`Background render failed for ${shareToken}:`, error);
    const service = await getSharedMediaService();
    await service.markShareFailed!(shareToken);
  }
}

// ── Router ──────────────────────────────────────────────────────────────────

const s = initServer();

export const shareContractRouter = s.router(sharesContract, {
  createImageShare: async (args) => {
    try {
      const userId = getUserId(args.req);
      if (!userId) return UNAUTHORIZED;
      const { imageData, title, imageType, metadata, originalImage, status } = args.body;

      const service = await getSharedMediaService();
      const share = await service.createImageShare(userId, {
        imageBase64: imageData,
        title: title || 'Geteiltes Bild',
        imageType: imageType || null,
        metadata: metadata || {},
        originalImage: originalImage || null,
        status: status === 'draft' ? 'draft' : 'ready',
      });

      log.info(
        `Image share created: ${share.shareToken} by user ${userId}${originalImage ? ' (with original)' : ''}`
      );

      return {
        status: 200 as const,
        body: {
          success: true as const,
          share: {
            shareToken: share.shareToken,
            shareUrl: share.shareUrl,
            createdAt: share.createdAt,
            mediaType: 'image' as const,
            hasOriginalImage: share.hasOriginalImage || false,
          },
        },
      };
    } catch (error) {
      log.error('Failed to create image share:', error);
      return {
        status: 500 as const,
        body: { success: false as const, error: 'Bild konnte nicht geteilt werden' },
      };
    }
  },

  createVideoShare: async (args) => {
    try {
      const userId = getUserId(args.req);
      if (!userId) return UNAUTHORIZED;
      const { exportToken, title, projectId } = args.body;

      const exportDataString = (await redisClient.get(`export:${exportToken}`)) as string | null;
      if (!exportDataString) {
        return {
          status: 404 as const,
          body: { success: false as const, error: 'Export nicht gefunden oder abgelaufen' },
        };
      }

      const exportData = parseJSON<ExportData>(exportDataString);
      if (exportData.status !== 'complete') {
        return {
          status: 400 as const,
          body: { success: false as const, error: 'Export noch nicht abgeschlossen' },
        };
      }

      const { outputPath, duration } = exportData;

      try {
        const { promises: fsPromises } = await import('fs');
        await fsPromises.access(outputPath);
      } catch {
        return {
          status: 404 as const,
          body: { success: false as const, error: 'Export-Datei nicht gefunden' },
        };
      }

      const service = await getSharedMediaService();
      const share = await service.createVideoShare(userId, {
        videoPath: outputPath,
        title: title || 'Geteiltes Video',
        thumbnailPath: null,
        duration: duration || null,
        projectId: projectId || null,
      });

      log.info(`Video share created: ${share.shareToken} by user ${userId}`);

      return {
        status: 200 as const,
        body: {
          success: true as const,
          share: {
            shareToken: share.shareToken,
            shareUrl: share.shareUrl,
            createdAt: share.createdAt,
            mediaType: 'video' as const,
            status: 'ready',
          },
        },
      };
    } catch (error) {
      log.error('Failed to create video share:', error);
      return {
        status: 500 as const,
        body: { success: false as const, error: 'Video konnte nicht geteilt werden' },
      };
    }
  },

  createVideoFromProject: async (args) => {
    try {
      const userId = getUserId(args.req);
      if (!userId) return UNAUTHORIZED;
      const { projectId, title } = args.body;

      const projService = await getProjectService();
      let project: Project;
      try {
        project = await projService.getProject(userId, projectId);
      } catch {
        return {
          status: 404 as const,
          body: {
            success: false as const,
            error: 'Projekt nicht gefunden oder keine Berechtigung',
          },
        };
      }

      if (!project || !project.video_path) {
        return {
          status: 404 as const,
          body: { success: false as const, error: 'Projekt-Video nicht gefunden' },
        };
      }

      let thumbnailPath: string | null = null;
      if (project.thumbnail_path) {
        const { promises: fsPromises } = await import('fs');
        thumbnailPath = projService.getThumbnailPath(project.thumbnail_path);
        try {
          await fsPromises.access(thumbnailPath);
        } catch {
          thumbnailPath = null;
        }
      }

      const service = await getSharedMediaService();

      if (!project.subtitled_video_path) {
        if (!project.subtitles) {
          return {
            status: 400 as const,
            body: {
              success: false as const,
              error: 'Projekt hat keine Untertitel zum Exportieren.',
              code: 'NO_SUBTITLES',
            },
          };
        }

        const share = await service.createPendingVideoShare(userId, {
          title: title || project.title || 'Geteiltes Video',
          thumbnailPath,
          duration: project.video_metadata?.duration || null,
          projectId,
        });

        void triggerBackgroundRender(userId, projectId, share.shareToken, project);

        log.info(
          `Video share created (rendering): ${share.shareToken} for project ${projectId} by user ${userId}`
        );

        return {
          status: 200 as const,
          body: {
            success: true as const,
            share: {
              shareToken: share.shareToken,
              shareUrl: share.shareUrl,
              createdAt: share.createdAt,
              mediaType: 'video' as const,
              status: 'processing',
            },
          },
        };
      }

      const { promises: fsPromises } = await import('fs');
      const videoPath = projService.getSubtitledVideoPath(project.subtitled_video_path);

      try {
        await fsPromises.access(videoPath);
      } catch {
        if (!project.subtitles) {
          return {
            status: 400 as const,
            body: {
              success: false as const,
              error: 'Video-Datei nicht gefunden und keine Untertitel zum Rendern.',
              code: 'NO_SUBTITLES',
            },
          };
        }

        const share = await service.createPendingVideoShare(userId, {
          title: title || project.title || 'Geteiltes Video',
          thumbnailPath,
          duration: project.video_metadata?.duration || null,
          projectId,
        });

        void triggerBackgroundRender(userId, projectId, share.shareToken, project);

        log.info(
          `Video share created (re-rendering): ${share.shareToken} for project ${projectId} by user ${userId}`
        );

        return {
          status: 200 as const,
          body: {
            success: true as const,
            share: {
              shareToken: share.shareToken,
              shareUrl: share.shareUrl,
              createdAt: share.createdAt,
              mediaType: 'video' as const,
              status: 'processing',
            },
          },
        };
      }

      const share = await service.createVideoShare(userId, {
        videoPath,
        title: title || project.title || 'Geteiltes Video',
        thumbnailPath,
        duration: project.video_metadata?.duration || null,
        projectId,
      });

      log.info(
        `Video share created from project: ${share.shareToken} for project ${projectId} by user ${userId}`
      );

      return {
        status: 200 as const,
        body: {
          success: true as const,
          share: {
            shareToken: share.shareToken,
            shareUrl: share.shareUrl,
            createdAt: share.createdAt,
            mediaType: 'video' as const,
            status: 'ready',
          },
        },
      };
    } catch (error) {
      log.error('Failed to create video share from project:', error);
      return {
        status: 500 as const,
        body: { success: false as const, error: 'Video konnte nicht geteilt werden' },
      };
    }
  },

  updateImageShare: async (args) => {
    try {
      const { shareToken } = args.params;
      const userId = getUserId(args.req);
      if (!userId) return UNAUTHORIZED;
      const { imageBase64, title, metadata, originalImage } = args.body;

      const service = await getSharedMediaService();

      const existingShare = await service.getShareByToken(shareToken);
      if (!existingShare) {
        return {
          status: 404 as const,
          body: { success: false as const, error: 'Share nicht gefunden' },
        };
      }

      if (existingShare.user_id !== userId) {
        return {
          status: 403 as const,
          body: {
            success: false as const,
            error: 'Nur die erstellende Person kann diesen Share bearbeiten',
          },
        };
      }

      if (existingShare.media_type !== 'image') {
        return {
          status: 400 as const,
          body: {
            success: false as const,
            error: 'Nur Bild-Shares können aktualisiert werden',
          },
        };
      }

      const updateParams: UpdateImageShareParams = {
        imageBase64,
        metadata: metadata || {},
        ...(title != null ? { title } : {}),
        ...(originalImage != null ? { originalImage } : {}),
      };
      const result = await service.updateImageShare(userId, shareToken, updateParams);

      log.info(`Image share updated: ${shareToken} by user ${userId}`);

      return {
        status: 200 as const,
        body: {
          success: true as const,
          share: {
            shareToken: result.shareToken,
            shareUrl: result.shareUrl,
            createdAt: result.createdAt,
            mediaType: 'image' as const,
            ...(result.hasOriginalImage != null
              ? { hasOriginalImage: result.hasOriginalImage }
              : {}),
          },
        },
      };
    } catch (error) {
      log.error('Failed to update image share:', error);
      return {
        status: 500 as const,
        body: { success: false as const, error: 'Bild konnte nicht aktualisiert werden' },
      };
    }
  },

  saveAsTemplate: async (args) => {
    try {
      const { shareToken } = args.params;
      const userInfo = getUserInfo(args.req);
      if (!userInfo) return UNAUTHORIZED;
      const { id: userId, displayName: userName } = userInfo;
      const { title, visibility = 'private' } = args.body;

      const service = await getSharedMediaService();
      await service.markAsTemplate(userId, shareToken, title || 'Template', visibility, userName);

      const templateUrl = `/image-studio?template=${shareToken}`;

      log.info(
        `Share ${shareToken} marked as template with visibility: ${visibility} by user ${userId}`
      );

      return {
        status: 200 as const,
        body: {
          success: true as const,
          templateUrl,
          shareToken,
          visibility,
        },
      };
    } catch (error) {
      log.error('Failed to save as template:', error);
      const errorMessage = (error as Error).message;
      if (errorMessage.includes('not found')) {
        return {
          status: 404 as const,
          body: { success: false as const, error: 'Share not found' },
        };
      } else if (errorMessage.includes('Not authorized')) {
        return {
          status: 403 as const,
          body: {
            success: false as const,
            error: 'Not authorized to mark this as template',
          },
        };
      }
      return {
        status: 500 as const,
        body: { success: false as const, error: 'Failed to save as template' },
      };
    }
  },

  pushToPhone: async (args) => {
    try {
      const userId = getUserId(args.req);
      if (!userId) return UNAUTHORIZED;
      const { shareToken } = args.body;

      const service = await getSharedMediaService();
      const share = await service.getShareByToken(shareToken);

      if (!share) {
        return {
          status: 404 as const,
          body: { success: false as const, error: 'Share not found' },
        };
      }

      if (share.user_id !== userId) {
        return {
          status: 403 as const,
          body: { success: false as const, error: 'Not authorized' },
        };
      }

      const mediaType = share.media_type || 'image';
      const notificationTitle =
        mediaType === 'video' ? 'Neues Video empfangen' : 'Neues Bild empfangen';
      const body = share.title || 'Von Grünerator gesendet';

      const { sendPushToUser } = await import('../../services/pushNotificationService.js');
      const pushedToDevices = await sendPushToUser(userId, {
        title: notificationTitle,
        body,
        data: { type: 'pushed_content', shareToken, mediaType },
      });

      log.info(`Push-to-phone: sent to ${pushedToDevices} device(s)`, { userId, shareToken });

      return {
        status: 200 as const,
        body: { success: true as const, pushedToDevices },
      };
    } catch (error) {
      log.error('Failed to push to phone:', error);
      return {
        status: 500 as const,
        body: { success: false as const, error: 'Failed to send to phone' },
      };
    }
  },
});

/**
 * Mount the ts-rest share contract router onto an Express app instance.
 * Call this from routes.ts BEFORE the legacy shareRouter mount.
 */
export function mountShareContractRouter(app: Application): void {
  createExpressEndpoints(sharesContract, shareContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'sharesContract'),
  });
}
