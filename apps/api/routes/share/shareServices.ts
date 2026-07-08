/**
 * Shared service access for the /api/share routers.
 *
 * Lazy-loads SharedMediaService + the subtitler ProjectService (heavy modules
 * pulled in on first use) and exposes the background-render orchestration used
 * by the video-from-project flow. Consumed by both the file router and the
 * read contract router.
 */

import fs from 'fs';
import path from 'path';

import { createLogger } from '../../utils/logger.js';

import type { SharedMediaRow, ShareResult } from '../../types/media.js';

const fsPromises = fs.promises;
const log = createLogger('share');

export interface ExportData {
  status: string;
  outputPath: string;
  duration?: number;
}

export interface Project {
  id?: string;
  video_path?: string;
  thumbnail_path?: string;
  subtitled_video_path?: string;
  subtitles?: unknown;
  title?: string;
  video_metadata?: {
    width?: number;
    height?: number;
    duration?: number;
  };
  style_preference?: string;
  height_preference?: string;
}

export interface CreateImageShareParams {
  imageBase64: string;
  title: string;
  imageType: string | null;
  metadata: Record<string, unknown>;
  originalImage: string | null;
  status?: 'ready' | 'draft';
}

export interface CreateVideoShareParams {
  videoPath: string;
  title: string;
  thumbnailPath: string | null;
  duration: number | null;
  projectId: string | null;
}

export interface CreatePendingVideoShareParams {
  title: string;
  thumbnailPath: string | null;
  duration: number | null;
  projectId: string;
}

export interface UpdateImageShareParams {
  imageBase64: string;
  title?: string;
  metadata: Record<string, unknown>;
  originalImage?: string | null;
}

export interface SharedMediaService {
  ensureInitialized(): Promise<void>;
  createImageShare(userId: string, params: CreateImageShareParams): Promise<ShareResult>;
  createVideoShare(userId: string, params: CreateVideoShareParams): Promise<ShareResult>;
  createPendingVideoShare(
    userId: string,
    params: CreatePendingVideoShareParams
  ): Promise<ShareResult>;
  getUserShares(
    userId: string,
    type: string | null,
    status?: string | readonly string[] | null,
    limit?: number
  ): Promise<SharedMediaRow[]>;
  getUserShareCount(userId: string): Promise<number>;
  getShareByToken(shareToken: string): Promise<SharedMediaRow | null>;
  recordView(shareToken: string): Promise<void>;
  recordDownload(
    shareToken: string,
    email: string | null,
    ip: string,
    shareId?: string
  ): Promise<void>;
  deleteShare(userId: string, shareToken: string): Promise<void>;
  finalizeVideoShare(shareToken: string, videoPath: string): Promise<void>;
  markShareFailed(shareToken: string): Promise<void>;
  updateImageShare(
    userId: string,
    shareToken: string,
    params: UpdateImageShareParams
  ): Promise<ShareResult>;
  getThumbnailFilePath(relativePath: string): string;
  getMediaFilePath(relativePath: string): string;
  getOriginalImagePath(shareToken: string, filename: string): string;
  clearOriginalImageMetadata(shareToken: string): Promise<void>;
  markAsTemplate(
    userId: string,
    shareToken: string,
    title: string,
    visibility: string,
    userName: string
  ): Promise<void>;
  cloneTemplate(templateToken: string, userId: string, userName: string): Promise<ShareResult>;
  getTemplates(userId: string | null, visibility: string): Promise<SharedMediaRow[]>;
  getTemplateByToken(
    templateToken: string,
    requestingUserId?: string
  ): Promise<SharedMediaRow | null>;
}

export interface ProjectService {
  ensureInitialized(): Promise<void>;
  getProject(userId: string, projectId: string): Promise<Project>;
  getVideoPath(relativePath: string): string;
  getSubtitledVideoPath(relativePath: string): string;
  getThumbnailPath(relativePath: string): string;
  updateSubtitledVideoPath(userId: string, projectId: string, relativePath: string): Promise<void>;
}

// Lazy-loaded services
let sharedMediaService: SharedMediaService | null = null;
let projectService: ProjectService | null = null;

export async function getSharedMediaService(): Promise<SharedMediaService> {
  if (!sharedMediaService) {
    const { getSharedMediaService: getService } =
      await import('../../services/sharedMediaService.js');
    sharedMediaService = getService() as unknown as SharedMediaService;
    await sharedMediaService.ensureInitialized();
  }
  return sharedMediaService;
}

export async function getProjectService(): Promise<ProjectService> {
  if (!projectService) {
    const { getSubtitlerProjectService } = await import('../../services/subtitler/index.js');
    projectService = getSubtitlerProjectService() as unknown as ProjectService;
    await projectService.ensureInitialized();
  }
  return projectService;
}

export async function triggerBackgroundRender(
  userId: string,
  projectId: string,
  shareToken: string,
  project: Project
): Promise<void> {
  try {
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
    await service.finalizeVideoShare(shareToken, subtitledVideoFullPath);

    try {
      await fsPromises.unlink(result.outputPath);
    } catch {
      // Ignore cleanup errors
    }

    log.info(`Background render complete for share ${shareToken}`);
  } catch (error) {
    log.error(`Background render failed for ${shareToken}:`, error);
    const service = await getSharedMediaService();
    await service.markShareFailed(shareToken);
  }
}
