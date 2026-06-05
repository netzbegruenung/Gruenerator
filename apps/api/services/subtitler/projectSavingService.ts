/**
 * Project Saving Service
 *
 * Handles saving and updating subtitled video projects.
 */

import fsPromises from 'fs/promises';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

import { type ProjectDataBody, type SubtitleSegment } from '@gruenerator/contracts';

import { type VideoMetadata } from '../../routes/subtitler/types.js';
import { createLogger } from '../../utils/logger.js';

import type { SubtitlerProjectService } from './ProjectService.js';
import type { SubtitlerProject } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const log = createLogger('projectSaving');
const PROJECTS_DIR = path.join(__dirname, '../../uploads/subtitler-projects');

interface FileStats {
  size: number;
}

interface AutoSaveParams {
  userId: string;
  outputPath: string;
  originalVideoPath: string;
  uploadId: string;
  originalFilename: string;
  segments: SubtitleSegment[];
  metadata: VideoMetadata;
  fileStats?: FileStats;
  stylePreference?: string;
  heightPreference?: string;
  subtitlePreference?: string;
  exportToken?: string;
}

/**
 * Service-layer create/update payload. Aliased to the wire contract so the
 * Zod-validated `req.body` flows in directly — no `Parameters<>` cast
 * needed at the controller. The contract uses `.nullish()` semantics
 * (`string | null | undefined`), which we accept here.
 */
type ProjectData = ProjectDataBody;

interface SaveResult {
  projectId: string;
  relativeSubtitledPath: string;
  isNew?: boolean;
}

let projectService: SubtitlerProjectService | null = null;

async function getProjectService(): Promise<SubtitlerProjectService> {
  if (!projectService) {
    const { getSubtitlerProjectService } = await import('./index.js');
    projectService = getSubtitlerProjectService();
    await projectService.ensureInitialized();
  }
  return projectService;
}

async function saveSubtitledVideo(
  userId: string,
  projectId: string,
  outputPath: string,
  existingSubtitledPath: string | null = null
): Promise<SaveResult> {
  const projectDir = path.join(PROJECTS_DIR, userId, projectId);
  const subtitledFilename = `subtitled_${Date.now()}.mp4`;
  const persistentPath = path.join(projectDir, subtitledFilename);
  const relativeSubtitledPath = `${userId}/${projectId}/${subtitledFilename}`;

  await fsPromises.mkdir(projectDir, { recursive: true });

  if (existingSubtitledPath) {
    const oldPath = path.join(PROJECTS_DIR, existingSubtitledPath);
    await fsPromises.unlink(oldPath).catch(() => {});
  }

  await fsPromises.copyFile(outputPath, persistentPath);

  const service = await getProjectService();
  await service.updateSubtitledVideoPath(userId, projectId, relativeSubtitledPath);

  return { projectId, relativeSubtitledPath };
}

async function saveToExistingProject(
  userId: string,
  projectId: string,
  outputPath: string
): Promise<SaveResult> {
  const service = await getProjectService();
  const project = await service.getProject(userId, projectId);

  const result = await saveSubtitledVideo(
    userId,
    projectId,
    outputPath,
    project.subtitled_video_path
  );

  log.info(`Saved subtitled video for project ${projectId}: ${result.relativeSubtitledPath}`);
  return result;
}

async function autoSaveProject(params: AutoSaveParams): Promise<SaveResult & { isNew: boolean }> {
  const {
    userId,
    outputPath,
    originalVideoPath,
    uploadId,
    originalFilename,
    segments,
    metadata,
    fileStats,
    stylePreference,
    heightPreference,
    subtitlePreference,
    exportToken,
  } = params;

  const service = await getProjectService();
  const existingProject = await service.findProjectByVideoFilename(userId, originalFilename);

  if (existingProject?.id) {
    const result = await saveSubtitledVideo(
      userId,
      existingProject.id,
      outputPath,
      existingProject.subtitled_video_path ?? null
    );

    log.info(`Updated existing project ${existingProject.id} for export ${exportToken}`);
    return { ...result, isNew: false };
  }

  const projectTitle = originalFilename.replace(/\.[^/.]+$/, '') || 'Untertiteltes Video';

  const newProject = await service.createProject(userId, {
    uploadId,
    title: projectTitle,
    subtitles: JSON.stringify(segments),
    stylePreference,
    heightPreference,
    modePreference: subtitlePreference,
    videoMetadata: metadata as unknown as Record<string, unknown>,
    videoFilename: originalFilename,
    videoSize: fileStats?.size || 0,
    videoSourcePath: originalVideoPath,
  });

  const result = await saveSubtitledVideo(userId, newProject.id, outputPath, null);

  log.info(`Auto-created project ${newProject.id} for export ${exportToken}`);
  return { ...result, isNew: true };
}

async function saveOrUpdateProject(
  userId: string,
  projectData: ProjectData
): Promise<{ project: SubtitlerProject; isNew: boolean }> {
  const service = await getProjectService();
  const existing = await service.findProjectByVideoFilename(userId, projectData.videoFilename);

  if (existing?.id) {
    const updated = await service.updateProject(userId, existing.id, {
      subtitles: JSON.stringify(projectData.subtitles),
      ...(projectData.title != null && { title: projectData.title }),
      ...(projectData.stylePreference != null && {
        style_preference: projectData.stylePreference,
      }),
      ...(projectData.heightPreference != null && {
        height_preference: projectData.heightPreference,
      }),
    });
    log.info(`Updated existing project ${existing.id} for video ${projectData.videoFilename}`);
    return { project: updated, isNew: false };
  }

  const project = await service.createProject(userId, {
    uploadId: projectData.uploadId || '',
    ...(projectData.title != null && { title: projectData.title }),
    subtitles: JSON.stringify(projectData.subtitles),
    ...(projectData.stylePreference != null && { stylePreference: projectData.stylePreference }),
    ...(projectData.heightPreference != null && { heightPreference: projectData.heightPreference }),
    ...(projectData.modePreference != null && { modePreference: projectData.modePreference }),
    ...(projectData.videoMetadata != null && {
      videoMetadata: projectData.videoMetadata as Record<string, unknown>,
    }),
    videoFilename: projectData.videoFilename,
    ...(projectData.videoSize != null && { videoSize: projectData.videoSize }),
  });
  log.info(`Created new project ${project.id} for video ${projectData.videoFilename}`);
  return { project, isNew: true };
}

export { saveToExistingProject, autoSaveProject, saveOrUpdateProject };
export type { AutoSaveParams, ProjectData, SaveResult, SubtitleSegment };
export type { VideoMetadata } from '../../routes/subtitler/types.js';
