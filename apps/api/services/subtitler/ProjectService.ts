/**
 * SubtitlerProjectService - Video subtitler project management
 *
 * Manages video projects with subtitles, including file storage and database operations
 */

import { getPostgresInstance } from '../../database/services/PostgresService.js';
import path from 'path';
import fs from 'fs/promises';
import { spawn, ChildProcess } from 'child_process';
import { fileURLToPath } from 'url';
import type {
  SubtitlerProject,
  SubtitlerProjectListItem,
  CreateProjectData,
  UpdateProjectData,
  DeleteProjectResult,
} from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MAX_PROJECTS_PER_USER = 20;
const PROJECT_STORAGE_PATH = path.join(__dirname, '../../uploads/subtitler-projects');
const TUS_UPLOAD_PATH = path.join(__dirname, '../../routes/subtitler/../../../uploads/tus-temp');

export class SubtitlerProjectService {
  private postgres: any;
  private initPromise: Promise<void> | null;

  constructor() {
    this.postgres = null;
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
      this.postgres = getPostgresInstance();
      await this.postgres.ensureInitialized();

      await fs.mkdir(PROJECT_STORAGE_PATH, { recursive: true });

      console.log('[SubtitlerProjectService] Initialized successfully');
    } catch (error: any) {
      console.error('[SubtitlerProjectService] Initialization failed:', error);
      throw error;
    }
  }

  async ensureInitialized(): Promise<void> {
    if (!this.postgres) {
      await this.init();
    }
  }

  async getUserProjects(userId: string): Promise<SubtitlerProjectListItem[]> {
    await this.ensureInitialized();

    try {
      const query = `
                SELECT id, title, status, video_filename, video_size, video_metadata,
                       thumbnail_path, subtitled_video_path, style_preference, height_preference, mode_preference,
                       created_at, updated_at, last_edited_at, export_count
                FROM subtitler_projects
                WHERE user_id = $1
                ORDER BY last_edited_at DESC
                LIMIT $2
            `;

      const results = await this.postgres.query(query, [userId, MAX_PROJECTS_PER_USER]);

      return results.map((row: any) => ({
        id: row.id,
        title: row.title,
        status: row.status,
        video_filename: row.video_filename,
        video_size: row.video_size,
        video_metadata: row.video_metadata,
        thumbnail_path: row.thumbnail_path,
        subtitled_video_path: row.subtitled_video_path,
        style_preference: row.style_preference,
        height_preference: row.height_preference,
        mode_preference: row.mode_preference,
        created_at: row.created_at,
        updated_at: row.updated_at,
        last_edited_at: row.last_edited_at,
        export_count: row.export_count,
      }));
    } catch (error: any) {
      console.error('[SubtitlerProjectService] Failed to get user projects:', error);
      throw new Error(`Failed to retrieve projects: ${error.message}`);
    }
  }

  async getProject(userId: string, projectId: string): Promise<SubtitlerProject> {
    await this.ensureInitialized();

    try {
      const query = `
                SELECT id, title, status, video_path, video_filename, video_size, video_metadata,
                       thumbnail_path, subtitled_video_path, subtitles, style_preference, height_preference, mode_preference,
                       created_at, updated_at, last_edited_at, export_count
                FROM subtitler_projects
                WHERE id = $1 AND user_id = $2
            `;

      const result = await this.postgres.queryOne(query, [projectId, userId]);

      if (!result) {
        throw new Error('Project not found');
      }

      return result as unknown as SubtitlerProject;
    } catch (error: any) {
      console.error('[SubtitlerProjectService] Failed to get project:', error);
      throw new Error(`Failed to retrieve project: ${error.message}`);
    }
  }

  /**
   * Get project by ID only (without user verification)
   * Use with caution - only for internal operations where user context is not available
   */
  async getProjectById(projectId: string): Promise<SubtitlerProject | null> {
    await this.ensureInitialized();

    try {
      const query = `
                SELECT id, title, status, video_path, video_filename, video_size, video_metadata,
                       thumbnail_path, subtitled_video_path, subtitles, style_preference, height_preference, mode_preference,
                       created_at, updated_at, last_edited_at, export_count
                FROM subtitler_projects
                WHERE id = $1
            `;

      const result = await this.postgres.queryOne(query, [projectId]);

      return result ? (result as unknown as SubtitlerProject) : null;
    } catch (error: any) {
      console.error('[SubtitlerProjectService] Failed to get project by id:', error);
      throw new Error(`Failed to retrieve project: ${error.message}`);
    }
  }

  async findProjectByVideoFilename(
    userId: string,
    videoFilename: string
  ): Promise<Partial<SubtitlerProject> | null> {
    await this.ensureInitialized();

    try {
      const query = `
                SELECT id, title, status, video_path, video_filename, subtitled_video_path
                FROM subtitler_projects
                WHERE user_id = $1 AND video_filename = $2
                ORDER BY updated_at DESC
                LIMIT 1
            `;
      const result = await this.postgres.queryOne(query, [userId, videoFilename]);
      return result ? (result as unknown as Partial<SubtitlerProject>) : null;
    } catch (error: any) {
      console.error('[SubtitlerProjectService] Failed to find project by filename:', error);
      return null;
    }
  }

  async getVideoPathOnly(userId: string, projectId: string): Promise<string | undefined> {
    await this.ensureInitialized();

    try {
      const query = `SELECT video_path FROM subtitler_projects WHERE id = $1 AND user_id = $2`;
      const result = await this.postgres.queryOne(query, [projectId, userId]);
      return result?.video_path;
    } catch (error: any) {
      console.error('[SubtitlerProjectService] Failed to get video path:', error);
      throw new Error(`Failed to retrieve video path: ${error.message}`);
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
      const projectDir = path.join(PROJECT_STORAGE_PATH, userId, projectId);
      await fs.mkdir(projectDir, { recursive: true });

      const tusVideoPath = path.join(__dirname, '../../uploads/tus-temp', uploadId);
      const sourceVideoPath = videoSourcePath || tusVideoPath;
      const targetVideoPath = path.join(projectDir, 'video.mp4');
      const thumbnailPath = path.join(projectDir, 'thumbnail.jpg');
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
      } catch (promoteError: any) {
        console.warn(
          '[SubtitlerProjectService] Could not mark upload as promoted:',
          promoteError.message
        );
      }

      try {
        await this.generateThumbnail(targetVideoPath, thumbnailPath);
        console.log(`[SubtitlerProjectService] Generated thumbnail at ${thumbnailPath}`);
      } catch (thumbError: any) {
        console.warn('[SubtitlerProjectService] Thumbnail generation failed:', thumbError.message);
      }

      let thumbnailExists = false;
      try {
        await fs.access(thumbnailPath);
        thumbnailExists = true;
      } catch {}

      const project = await this.postgres.insert('subtitler_projects', {
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
      });

      console.log(`[SubtitlerProjectService] Created project ${projectId} for user ${userId}`);

      return project as unknown as SubtitlerProject;
    } catch (error: any) {
      console.error('[SubtitlerProjectService] Failed to create project:', error);
      throw new Error(`Failed to create project: ${error.message}`);
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
        'status',
      ];
      const updateData: Record<string, any> = {};

      for (const field of allowedFields) {
        const camelCaseField = field.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
        if (updates[field as keyof UpdateProjectData] !== undefined) {
          updateData[field] = updates[field as keyof UpdateProjectData];
        } else if (updates[camelCaseField as keyof UpdateProjectData] !== undefined) {
          updateData[field] = updates[camelCaseField as keyof UpdateProjectData];
        }
      }

      updateData.last_edited_at = new Date().toISOString();

      console.log(
        '[SubtitlerProjectService] updateProject - updates received:',
        Object.keys(updates)
      );
      console.log(
        '[SubtitlerProjectService] updateProject - updateData to save:',
        Object.keys(updateData)
      );

      const result = await this.postgres.update('subtitler_projects', updateData, {
        id: projectId,
        user_id: userId,
      });

      if (result.data.length === 0) {
        throw new Error('Project not found or access denied');
      }

      console.log(`[SubtitlerProjectService] Updated project ${projectId}`);

      return result.data[0] as unknown as SubtitlerProject;
    } catch (error: any) {
      console.error('[SubtitlerProjectService] Failed to update project:', error);
      throw new Error(`Failed to update project: ${error.message}`);
    }
  }

  async incrementExportCount(
    userId: string,
    projectId: string
  ): Promise<SubtitlerProject | undefined> {
    await this.ensureInitialized();

    try {
      const query = `
                UPDATE subtitler_projects
                SET export_count = export_count + 1,
                    status = 'exported',
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $1 AND user_id = $2
                RETURNING *
            `;

      const result = await this.postgres.query(query, [projectId, userId]);
      return result[0] as unknown as SubtitlerProject;
    } catch (error: any) {
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
      const query = `
                UPDATE subtitler_projects
                SET subtitled_video_path = $1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $2 AND user_id = $3
                RETURNING *
            `;

      const result = await this.postgres.query(query, [subtitledVideoPath, projectId, userId]);

      if (result.length === 0) {
        throw new Error('Project not found or access denied');
      }

      console.log(
        `[SubtitlerProjectService] Updated subtitled_video_path for project ${projectId}`
      );
      return result[0] as unknown as SubtitlerProject;
    } catch (error: any) {
      console.error('[SubtitlerProjectService] Failed to update subtitled video path:', error);
      throw new Error(`Failed to update subtitled video path: ${error.message}`);
    }
  }

  async deleteProject(userId: string, projectId: string): Promise<DeleteProjectResult> {
    await this.ensureInitialized();

    try {
      const project = await this.getProject(userId, projectId);

      if (!project) {
        throw new Error('Project not found');
      }

      await this.postgres.delete('subtitler_projects', { id: projectId, user_id: userId });

      const projectDir = path.join(PROJECT_STORAGE_PATH, userId, projectId);
      try {
        await fs.rm(projectDir, { recursive: true, force: true });
        console.log(`[SubtitlerProjectService] Deleted project files at ${projectDir}`);
      } catch (fileError: any) {
        console.warn(
          '[SubtitlerProjectService] Failed to delete project files:',
          fileError.message
        );
      }

      console.log(`[SubtitlerProjectService] Deleted project ${projectId} for user ${userId}`);

      return { success: true };
    } catch (error: any) {
      console.error('[SubtitlerProjectService] Failed to delete project:', error);
      throw new Error(`Failed to delete project: ${error.message}`);
    }
  }

  async enforceProjectLimit(userId: string): Promise<void> {
    await this.ensureInitialized();

    try {
      const countQuery = `SELECT COUNT(*) as count FROM subtitler_projects WHERE user_id = $1`;
      const countResult = await this.postgres.queryOne(countQuery, [userId]);
      const count = parseInt(countResult.count, 10);

      if (count >= MAX_PROJECTS_PER_USER) {
        const oldestQuery = `
                    SELECT id, video_path, thumbnail_path
                    FROM subtitler_projects
                    WHERE user_id = $1
                    ORDER BY last_edited_at ASC
                    LIMIT $2
                `;
        const toDelete = count - MAX_PROJECTS_PER_USER + 1;
        const oldestProjects = await this.postgres.query(oldestQuery, [userId, toDelete]);

        for (const project of oldestProjects) {
          console.log(
            `[SubtitlerProjectService] Auto-deleting oldest project ${project.id} to enforce limit`
          );
          await this.deleteProject(userId, project.id);
        }
      }
    } catch (error: any) {
      console.error('[SubtitlerProjectService] Failed to enforce project limit:', error);
    }
  }

  async getProjectCount(userId: string): Promise<number> {
    await this.ensureInitialized();

    try {
      const query = `SELECT COUNT(*) as count FROM subtitler_projects WHERE user_id = $1`;
      const result = await this.postgres.queryOne(query, [userId]);
      return parseInt(result.count, 10);
    } catch (error: any) {
      console.error('[SubtitlerProjectService] Failed to get project count:', error);
      return 0;
    }
  }

  generateThumbnail(videoPath: string, outputPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const ffmpeg: ChildProcess = spawn('ffmpeg', [
        '-y',
        '-i',
        videoPath,
        '-ss',
        '00:00:02',
        '-vframes',
        '1',
        '-vf',
        'scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:(ow-iw)/2:(oh-ih)/2',
        '-q:v',
        '2',
        outputPath,
      ]);

      let stderr = '';

      ffmpeg.stderr?.on('data', (data) => {
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
    return path.join(PROJECT_STORAGE_PATH, relativePath);
  }

  getThumbnailPath(relativePath: string): string {
    return path.join(PROJECT_STORAGE_PATH, relativePath);
  }

  getSubtitledVideoPath(relativePath: string): string {
    return path.join(PROJECT_STORAGE_PATH, relativePath);
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
