/**
 * SubtitlerProjectService - Video subtitler project management
 *
 * Manages video projects with subtitles, including file storage and database operations
 */

import { spawn, type ChildProcess } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import { and, eq, sql, asc, type InferSelectModel } from 'drizzle-orm';

import { subtitlerProjects } from '../../database/schema/index.js';
import { getDrizzleInstance, type DrizzleDB } from '../../database/services/DrizzleService.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';

import type {
  SubtitlerProject,
  SubtitlerProjectListItem,
  CreateProjectData,
  UpdateProjectData,
  DeleteProjectResult,
} from './types.js';

type SubtitlerProjectRow = InferSelectModel<typeof subtitlerProjects>;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MAX_PROJECTS_PER_USER = 20;
const PROJECT_STORAGE_PATH = path.join(__dirname, '../../uploads/subtitler-projects');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validatePathId(id: string, label: string): string {
  if (!UUID_RE.test(id)) throw new Error(`Invalid ${label}: must be a UUID`);
  return id;
}
function toSubtitlerProject(row: SubtitlerProjectRow): SubtitlerProject {
  return {
    ...row,
    user_id: row.user_id ?? '',
    status: row.status as SubtitlerProject['status'],
    subtitles: row.subtitles ?? '',
    style_settings: row.style_settings,
  };
}

export class SubtitlerProjectService {
  private db: DrizzleDB | null;
  private initPromise: Promise<void> | null;

  constructor() {
    this.db = null;
    this.initPromise = null;
  }

  async init(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this._init();
    }
    return this.initPromise;
  }

  private async _init(): Promise<void> {
    try {
      const postgres = getPostgresInstance();
      await postgres.ensureInitialized();
      this.db = getDrizzleInstance();

      await fs.mkdir(PROJECT_STORAGE_PATH, { recursive: true });

      console.log('[SubtitlerProjectService] Initialized successfully');
    } catch (error: unknown) {
      console.error('[SubtitlerProjectService] Initialization failed:', error);
      throw error;
    }
  }

  async ensureInitialized(): Promise<void> {
    if (!this.db) {
      await this.init();
    }
  }

  async getUserProjects(userId: string): Promise<SubtitlerProjectListItem[]> {
    await this.ensureInitialized();

    try {
      const results = await this.db!.select({
        id: subtitlerProjects.id,
        title: subtitlerProjects.title,
        status: subtitlerProjects.status,
        video_filename: subtitlerProjects.video_filename,
        video_size: subtitlerProjects.video_size,
        video_metadata: subtitlerProjects.video_metadata,
        thumbnail_path: subtitlerProjects.thumbnail_path,
        subtitled_video_path: subtitlerProjects.subtitled_video_path,
        style_preference: subtitlerProjects.style_preference,
        height_preference: subtitlerProjects.height_preference,
        mode_preference: subtitlerProjects.mode_preference,
        created_at: subtitlerProjects.created_at,
        updated_at: subtitlerProjects.updated_at,
        last_edited_at: subtitlerProjects.last_edited_at,
        export_count: subtitlerProjects.export_count,
      })
        .from(subtitlerProjects)
        .where(eq(subtitlerProjects.user_id, userId))
        .orderBy(sql`${subtitlerProjects.last_edited_at} DESC`)
        .limit(MAX_PROJECTS_PER_USER);

      return results;
    } catch (error: unknown) {
      console.error('[SubtitlerProjectService] Failed to get user projects:', error);
      throw new Error(
        `Failed to retrieve projects: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async getProject(userId: string, projectId: string): Promise<SubtitlerProject> {
    await this.ensureInitialized();

    try {
      const rows = await this.db!.select()
        .from(subtitlerProjects)
        .where(and(eq(subtitlerProjects.id, projectId), eq(subtitlerProjects.user_id, userId)))
        .limit(1);

      const result = rows[0];

      if (!result) {
        throw new Error('Project not found');
      }

      return toSubtitlerProject(result);
    } catch (error: unknown) {
      console.error('[SubtitlerProjectService] Failed to get project:', error);
      throw new Error(
        `Failed to retrieve project: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get project by ID only (without user verification)
   * Use with caution - only for internal operations where user context is not available
   */
  async getProjectById(projectId: string): Promise<SubtitlerProject | null> {
    await this.ensureInitialized();

    try {
      const rows = await this.db!.select()
        .from(subtitlerProjects)
        .where(eq(subtitlerProjects.id, projectId))
        .limit(1);

      const result = rows[0];
      return result ? toSubtitlerProject(result) : null;
    } catch (error: unknown) {
      console.error('[SubtitlerProjectService] Failed to get project by id:', error);
      throw new Error(
        `Failed to retrieve project: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async findProjectByVideoFilename(
    userId: string,
    videoFilename: string
  ): Promise<{
    id: string;
    title: string;
    status: string;
    video_path: string;
    video_filename: string;
    subtitled_video_path: string | null;
  } | null> {
    await this.ensureInitialized();

    try {
      const rows = await this.db!.select({
        id: subtitlerProjects.id,
        title: subtitlerProjects.title,
        status: subtitlerProjects.status,
        video_path: subtitlerProjects.video_path,
        video_filename: subtitlerProjects.video_filename,
        subtitled_video_path: subtitlerProjects.subtitled_video_path,
      })
        .from(subtitlerProjects)
        .where(
          and(
            eq(subtitlerProjects.user_id, userId),
            eq(subtitlerProjects.video_filename, videoFilename)
          )
        )
        .orderBy(sql`${subtitlerProjects.updated_at} DESC`)
        .limit(1);

      return rows[0] ?? null;
    } catch (error: unknown) {
      console.error('[SubtitlerProjectService] Failed to find project by filename:', error);
      return null;
    }
  }

  async getVideoPathOnly(userId: string, projectId: string): Promise<string | undefined> {
    await this.ensureInitialized();

    try {
      const rows = await this.db!.select({ video_path: subtitlerProjects.video_path })
        .from(subtitlerProjects)
        .where(and(eq(subtitlerProjects.id, projectId), eq(subtitlerProjects.user_id, userId)))
        .limit(1);

      return rows[0]?.video_path;
    } catch (error: unknown) {
      console.error('[SubtitlerProjectService] Failed to get video path:', error);
      throw new Error(
        `Failed to retrieve video path: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async createProject(userId: string, projectData: CreateProjectData): Promise<SubtitlerProject> {
    await this.ensureInitialized();

    const {
      uploadId,
      subtitles,
      title,
      stylePreference,
      heightPreference,
      modePreference,
      videoMetadata,
      videoFilename,
      videoSize,
      videoSourcePath,
    } = projectData;

    try {
      await this.enforceProjectLimit(userId);

      const projectId = crypto.randomUUID();
      validatePathId(userId, 'userId');

      if (!/^[a-zA-Z0-9_-]+$/.test(uploadId)) {
        throw new Error('Invalid uploadId format');
      }

      const projectBase = path.resolve(PROJECT_STORAGE_PATH);
      const projectDir = path.resolve(projectBase, userId, projectId);
      if (!projectDir.startsWith(projectBase + path.sep)) {
        throw new Error('Path traversal detected in projectDir');
      }
      await fs.mkdir(projectDir, { recursive: true });

      const uploadsDir = path.resolve(__dirname, '../../uploads');
      const tusVideoPath = path.resolve(uploadsDir, 'tus-temp', uploadId);
      if (!tusVideoPath.startsWith(uploadsDir + path.sep)) {
        throw new Error('Path traversal detected in tusVideoPath');
      }
      let sourceVideoPath: string;
      if (videoSourcePath) {
        const resolvedSource = path.resolve(uploadsDir, videoSourcePath);
        if (!resolvedSource.startsWith(uploadsDir + path.sep)) {
          throw new Error('Path traversal detected in videoSourcePath');
        }
        sourceVideoPath = resolvedSource;
      } else {
        sourceVideoPath = tusVideoPath;
      }
      const targetVideoPath = path.resolve(projectDir, 'video.mp4');
      if (!targetVideoPath.startsWith(projectBase + path.sep)) {
        throw new Error('Path traversal detected in targetVideoPath');
      }
      const thumbnailPath = path.resolve(projectDir, 'thumbnail.jpg');
      if (!thumbnailPath.startsWith(projectBase + path.sep)) {
        throw new Error('Path traversal detected in thumbnailPath');
      }
      const relativeVideoPath = `${userId}/${projectId}/video.mp4`;
      const relativeThumbnailPath = `${userId}/${projectId}/thumbnail.jpg`;

      try {
        await fs.access(sourceVideoPath);
      } catch {
        throw new Error(`Video file not found at ${sourceVideoPath}`);
      }

      await fs.copyFile(sourceVideoPath, targetVideoPath);
      console.log(`[SubtitlerProjectService] Copied video to ${targetVideoPath}`);

      // Mark upload as promoted to prevent cleanup
      try {
        const { markUploadAsPromoted } = await import('./tusService.js');
        markUploadAsPromoted(uploadId);
      } catch (promoteError: unknown) {
        console.warn(
          '[SubtitlerProjectService] Could not mark upload as promoted:',
          promoteError instanceof Error ? promoteError.message : String(promoteError)
        );
      }

      try {
        await this.generateThumbnail(targetVideoPath, thumbnailPath);
        console.log(`[SubtitlerProjectService] Generated thumbnail at ${thumbnailPath}`);
      } catch (thumbError: unknown) {
        console.warn(
          '[SubtitlerProjectService] Thumbnail generation failed:',
          thumbError instanceof Error ? thumbError.message : String(thumbError)
        );
      }

      let thumbnailExists = false;
      try {
        await fs.access(thumbnailPath);
        thumbnailExists = true;
      } catch {
        /* file does not exist */
      }

      const rows = await this.db!.insert(subtitlerProjects)
        .values({
          id: projectId,
          user_id: userId,
          title: title || `Projekt ${new Date().toLocaleDateString('de-DE')}`,
          status: 'saved',
          video_path: relativeVideoPath,
          video_filename: videoFilename || 'video.mp4',
          video_size: videoSize || 0,
          video_metadata: videoMetadata || {},
          thumbnail_path: thumbnailExists ? relativeThumbnailPath : null,
          subtitles: subtitles || '',
          style_preference: stylePreference || 'standard',
          height_preference: heightPreference || 'standard',
          mode_preference: modePreference || 'manual',
        })
        .returning();

      console.log(`[SubtitlerProjectService] Created project ${projectId} for user ${userId}`);

      return toSubtitlerProject(rows[0]);
    } catch (error: unknown) {
      console.error('[SubtitlerProjectService] Failed to create project:', error);
      throw new Error(
        `Failed to create project: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async updateProject(
    userId: string,
    projectId: string,
    updates: UpdateProjectData
  ): Promise<SubtitlerProject> {
    await this.ensureInitialized();

    try {
      const allowedFields = [
        'title',
        'subtitles',
        'style_preference',
        'height_preference',
        'style_settings',
        'status',
      ];
      const updateData: Record<string, unknown> = {};

      for (const field of allowedFields) {
        const camelCaseField = field.replace(/_([a-z])/g, (_: string, letter: string): string =>
          letter.toUpperCase()
        );
        if (updates[field as keyof UpdateProjectData] !== undefined) {
          updateData[field] = updates[field as keyof UpdateProjectData];
        } else if (updates[camelCaseField as keyof UpdateProjectData] !== undefined) {
          updateData[field] = updates[camelCaseField as keyof UpdateProjectData];
        }
      }

      updateData.last_edited_at = new Date();

      console.log(
        '[SubtitlerProjectService] updateProject - updates received:',
        Object.keys(updates)
      );
      console.log(
        '[SubtitlerProjectService] updateProject - updateData to save:',
        Object.keys(updateData)
      );

      const rows = await this.db!.update(subtitlerProjects)
        .set(updateData)
        .where(and(eq(subtitlerProjects.id, projectId), eq(subtitlerProjects.user_id, userId)))
        .returning();

      if (rows.length === 0) {
        throw new Error('Project not found or access denied');
      }

      console.log(`[SubtitlerProjectService] Updated project ${projectId}`);

      return toSubtitlerProject(rows[0]);
    } catch (error: unknown) {
      console.error('[SubtitlerProjectService] Failed to update project:', error);
      throw new Error(
        `Failed to update project: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async incrementExportCount(
    userId: string,
    projectId: string
  ): Promise<SubtitlerProject | undefined> {
    await this.ensureInitialized();

    try {
      const rows = await this.db!.update(subtitlerProjects)
        .set({
          export_count: sql`${subtitlerProjects.export_count} + 1`,
          status: 'exported',
          updated_at: new Date(),
        })
        .where(and(eq(subtitlerProjects.id, projectId), eq(subtitlerProjects.user_id, userId)))
        .returning();

      const row = rows[0];
      return row ? toSubtitlerProject(row) : undefined;
    } catch (error: unknown) {
      console.error('[SubtitlerProjectService] Failed to increment export count:', error);
      return undefined;
    }
  }

  async updateSubtitledVideoPath(
    userId: string,
    projectId: string,
    subtitledVideoPath: string
  ): Promise<SubtitlerProject> {
    await this.ensureInitialized();

    try {
      const rows = await this.db!.update(subtitlerProjects)
        .set({
          subtitled_video_path: subtitledVideoPath,
          updated_at: new Date(),
        })
        .where(and(eq(subtitlerProjects.id, projectId), eq(subtitlerProjects.user_id, userId)))
        .returning();

      if (rows.length === 0) {
        throw new Error('Project not found or access denied');
      }

      console.log(
        `[SubtitlerProjectService] Updated subtitled_video_path for project ${projectId}`
      );
      return toSubtitlerProject(rows[0]);
    } catch (error: unknown) {
      console.error('[SubtitlerProjectService] Failed to update subtitled video path:', error);
      throw new Error(
        `Failed to update subtitled video path: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async deleteProject(userId: string, projectId: string): Promise<DeleteProjectResult> {
    await this.ensureInitialized();

    try {
      const project = await this.getProject(userId, projectId);

      if (!project) {
        throw new Error('Project not found');
      }

      await this.db!.delete(subtitlerProjects).where(
        and(eq(subtitlerProjects.id, projectId), eq(subtitlerProjects.user_id, userId))
      );

      validatePathId(userId, 'userId');
      validatePathId(projectId, 'projectId');
      const projectBase = path.resolve(PROJECT_STORAGE_PATH);
      const projectDir = path.resolve(projectBase, userId, projectId);
      if (!projectDir.startsWith(projectBase + path.sep)) {
        throw new Error('Path traversal detected in projectDir');
      }
      try {
        await fs.rm(projectDir, { recursive: true, force: true });
        console.log(`[SubtitlerProjectService] Deleted project files at ${projectDir}`);
      } catch (fileError: unknown) {
        console.warn(
          '[SubtitlerProjectService] Failed to delete project files:',
          fileError instanceof Error ? fileError.message : String(fileError)
        );
      }

      console.log(`[SubtitlerProjectService] Deleted project ${projectId} for user ${userId}`);

      return { success: true };
    } catch (error: unknown) {
      console.error('[SubtitlerProjectService] Failed to delete project:', error);
      throw new Error(
        `Failed to delete project: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async enforceProjectLimit(userId: string): Promise<void> {
    await this.ensureInitialized();

    try {
      const countResult = await this.db!.select({ count: sql<number>`COUNT(*)::int` })
        .from(subtitlerProjects)
        .where(eq(subtitlerProjects.user_id, userId));

      const count = countResult[0]?.count ?? 0;

      if (count >= MAX_PROJECTS_PER_USER) {
        const toDelete = count - MAX_PROJECTS_PER_USER + 1;
        const oldestProjects = await this.db!.select({ id: subtitlerProjects.id })
          .from(subtitlerProjects)
          .where(eq(subtitlerProjects.user_id, userId))
          .orderBy(asc(subtitlerProjects.last_edited_at))
          .limit(toDelete);

        for (const project of oldestProjects) {
          console.log(
            `[SubtitlerProjectService] Auto-deleting oldest project ${project.id} to enforce limit`
          );
          await this.deleteProject(userId, project.id);
        }
      }
    } catch (error: unknown) {
      console.error('[SubtitlerProjectService] Failed to enforce project limit:', error);
    }
  }

  async getProjectCount(userId: string): Promise<number> {
    await this.ensureInitialized();

    try {
      const result = await this.db!.select({ count: sql<number>`COUNT(*)::int` })
        .from(subtitlerProjects)
        .where(eq(subtitlerProjects.user_id, userId));

      return result[0]?.count ?? 0;
    } catch (error: unknown) {
      console.error('[SubtitlerProjectService] Failed to get project count:', error);
      return 0;
    }
  }

  generateThumbnail(videoPath: string, outputPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      // Scale to fit within 480px on the longest side, preserving original aspect ratio.
      // Portrait (9:16) videos → ~270x480, landscape (16:9) → 480x270.
      // No padding/letterboxing — the thumbnail matches the video's native shape.
      const ffmpeg: ChildProcess = spawn('ffmpeg', [
        '-y',
        '-i',
        videoPath,
        '-ss',
        '00:00:02',
        '-vframes',
        '1',
        '-vf',
        'scale=480:480:force_original_aspect_ratio=decrease',
        '-q:v',
        '2',
        outputPath,
      ]);

      let stderr = '';

      ffmpeg.stderr?.on('data', (data: Buffer | string) => {
        stderr += data.toString();
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve(outputPath);
        } else {
          reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-500)}`));
        }
      });

      ffmpeg.on('error', (err) => {
        reject(new Error(`FFmpeg spawn error: ${err.message}`));
      });

      setTimeout(() => {
        ffmpeg.kill('SIGKILL');
        reject(new Error('Thumbnail generation timeout'));
      }, 30000);
    });
  }

  getVideoPath(relativePath: string): string {
    const base = path.resolve(PROJECT_STORAGE_PATH);
    const resolved = path.resolve(base, relativePath);
    if (!resolved.startsWith(base + path.sep)) {
      throw new Error('Path traversal detected in video path');
    }
    return resolved;
  }

  getThumbnailPath(relativePath: string): string {
    const base = path.resolve(PROJECT_STORAGE_PATH);
    const resolved = path.resolve(base, relativePath);
    if (!resolved.startsWith(base + path.sep)) {
      throw new Error('Path traversal detected in thumbnail path');
    }
    return resolved;
  }

  getSubtitledVideoPath(relativePath: string): string {
    const base = path.resolve(PROJECT_STORAGE_PATH);
    const resolved = path.resolve(base, relativePath);
    if (!resolved.startsWith(base + path.sep)) {
      throw new Error('Path traversal detected in subtitled video path');
    }
    return resolved;
  }
}

let subtitlerProjectInstance: SubtitlerProjectService | null = null;

export function getSubtitlerProjectService(): SubtitlerProjectService {
  if (!subtitlerProjectInstance) {
    subtitlerProjectInstance = new SubtitlerProjectService();
  }
  return subtitlerProjectInstance;
}

export default SubtitlerProjectService;
