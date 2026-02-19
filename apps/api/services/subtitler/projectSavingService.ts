/**
 * Project Saving Service
 *
 * Handles saving and updating subtitled video projects.
 */

import fsPromises from 'fs/promises';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

import { createLogger } from '../../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const log = createLogger('projectSaving');
const PROJECTS_DIR = path.join(__dirname, '../../uploads/subtitler-projects');

interface SubtitleSegment {
  text: string;
  start: number;
  end: number;
  [key: string]: any;
}

interface VideoMetadata {
  width: number;
  height: number;
  duration?: string | number;
  [key: string]: any;
}

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

interface ProjectData {
  videoFilename: string;
  subtitles: SubtitleSegment[];
  title?: string;
  stylePreference?: string;
  heightPreference?: string;
  [key: string]: any;
}

interface SaveResult {
  projectId: string;
  relativeSubtitledPath: string;
  isNew?: boolean;
}

interface ProjectService {
  ensureInitialized(): Promise<void>;
  updateSubtitledVideoPath(userId: string, projectId: string, path: string): Promise<any>;
  getProject(userId: string, projectId: string): Promise<any>;
  findProjectByVideoFilename(userId: string, filename: string): Promise<any>;
  createProject(userId: string, data: any): Promise<any>;
  updateProject(userId: string, projectId: string, data: any): Promise<any>;
}

let projectService: ProjectService | null = null;

async function getProjectService(): Promise<ProjectService> {
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

  if (existingProject) {
    const result = await saveSubtitledVideo(
      userId,
      existingProject.id,
      outputPath,
      existingProject.subtitled_video_path
    );

    log.info(`Updated existing project ${existingProject.id} for export ${exportToken}`);
    return { ...result, isNew: false };
  }

  const projectTitle = originalFilename.replace(/\.[^/.]+$/, '') || 'Untertiteltes Video';

  const newProject = await service.createProject(userId, {
    uploadId,
    title: projectTitle,
    subtitles: segments,
    stylePreference,
    heightPreference,
    modePreference: subtitlePreference,
    videoMetadata: metadata,
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
): Promise<{ project: any; isNew: boolean }> {
  const service = await getProjectService();
  const existing = await service.findProjectByVideoFilename(userId, projectData.videoFilename);

  if (existing) {
    await service.updateProject(userId, existing.id, {
      subtitles: projectData.subtitles,
      title: projectData.title,
      style_preference: projectData.stylePreference,
      height_preference: projectData.heightPreference,
    });
    log.info(`Updated existing project ${existing.id} for video ${projectData.videoFilename}`);
    return { project: { ...existing, ...projectData }, isNew: false };
  }

  const project = await service.createProject(userId, projectData);
  log.info(`Created new project ${project.id} for video ${projectData.videoFilename}`);
  return { project, isNew: true };
}

export { saveToExistingProject, autoSaveProject, saveOrUpdateProject };
export type { AutoSaveParams, ProjectData, SaveResult, SubtitleSegment, VideoMetadata };
