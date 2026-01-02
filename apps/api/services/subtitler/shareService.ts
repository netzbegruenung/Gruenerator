/**
 * Share Service
 *
 * Manages video sharing with expiration and download tracking.
 */

import { getPostgresInstance, PostgresService } from '../../database/services/PostgresService.js';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createLogger } from '../../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const log = createLogger('shareService');

const SHARED_VIDEOS_PATH = path.join(__dirname, '../../uploads/shared-videos');
const DEFAULT_EXPIRATION_DAYS = 7;

interface CreateShareParams {
  videoPath: string;
  title?: string;
  thumbnailPath?: string;
  duration?: number;
  projectId?: string;
  expiresInDays?: number;
}

interface CreatePendingShareParams {
  title?: string;
  thumbnailPath?: string;
  duration?: number;
  projectId?: string;
  expiresInDays?: number;
}

interface ShareResult {
  id: string;
  shareToken: string;
  shareUrl: string;
  createdAt: Date;
  expiresAt: Date;
  status?: string;
}

interface ShareData {
  id: string;
  user_id: string;
  project_id?: string;
  share_token: string;
  video_path?: string;
  video_filename?: string;
  title: string;
  thumbnail_path?: string;
  duration?: number;
  expires_at: Date;
  download_count: number;
  created_at: Date;
  status: string;
  sharer_name?: string;
  expired: boolean;
}

class SubtitlerShareService {
  private postgres: PostgresService | null = null;
  private initPromise: Promise<void> | null = null;

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
      await fs.mkdir(SHARED_VIDEOS_PATH, { recursive: true });
      log.info('[SubtitlerShareService] Initialized successfully');
    } catch (error: any) {
      log.error('[SubtitlerShareService] Initialization failed:', error);
      throw error;
    }
  }

  async ensureInitialized(): Promise<void> {
    if (!this.postgres) {
      await this.init();
    }
  }

  generateShareToken(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  async createShare(userId: string, params: CreateShareParams): Promise<ShareResult> {
    await this.ensureInitialized();

    const { videoPath, title, thumbnailPath, duration, projectId, expiresInDays = DEFAULT_EXPIRATION_DAYS } = params;
    const shareToken = this.generateShareToken();
    const shareDir = path.join(SHARED_VIDEOS_PATH, shareToken);

    try {
      await fs.mkdir(shareDir, { recursive: true });

      const targetVideoPath = path.join(shareDir, 'video.mp4');
      await fs.copyFile(videoPath, targetVideoPath);

      const videoFilename = path.basename(videoPath);
      const relativeVideoPath = `${shareToken}/video.mp4`;

      let relativeThumbnailPath: string | null = null;
      if (thumbnailPath) {
        try {
          await fs.access(thumbnailPath);
          const targetThumbnailPath = path.join(shareDir, 'thumbnail.jpg');
          await fs.copyFile(thumbnailPath, targetThumbnailPath);
          relativeThumbnailPath = `${shareToken}/thumbnail.jpg`;
        } catch {
          log.debug('[SubtitlerShareService] No thumbnail to copy');
        }
      }

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresInDays);

      const query = `
        INSERT INTO subtitler_shared_videos
        (user_id, project_id, share_token, video_path, video_filename, title, thumbnail_path, duration, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id, share_token, created_at, expires_at
      `;

      const result = await this.postgres!.queryOne(query, [
        userId,
        projectId || null,
        shareToken,
        relativeVideoPath,
        videoFilename,
        title || 'Untertiteltes Video',
        relativeThumbnailPath,
        duration || null,
        expiresAt.toISOString()
      ]);

      log.info(`[SubtitlerShareService] Created share ${shareToken} for user ${userId}`);

      const typedResult = result as { id: string; share_token: string; created_at: Date; expires_at: Date };
      return {
        id: typedResult.id,
        shareToken: typedResult.share_token,
        shareUrl: `/subtitler/share/${shareToken}`,
        createdAt: typedResult.created_at,
        expiresAt: typedResult.expires_at
      };

    } catch (error: any) {
      try {
        await fs.rm(shareDir, { recursive: true, force: true });
      } catch {}
      log.error('[SubtitlerShareService] Failed to create share:', error);
      throw new Error(`Failed to create share: ${error.message}`);
    }
  }

  async getShareByToken(shareToken: string): Promise<ShareData | null> {
    await this.ensureInitialized();

    try {
      const query = `
        SELECT sv.id, sv.user_id, sv.project_id, sv.share_token, sv.video_path, sv.video_filename,
               sv.title, sv.thumbnail_path, sv.duration, sv.expires_at, sv.download_count, sv.created_at,
               sv.status, COALESCE(p.first_name, p.display_name, 'Jemand') as sharer_name
        FROM subtitler_shared_videos sv
        LEFT JOIN profiles p ON sv.user_id = p.id
        WHERE sv.share_token = $1
      `;

      const result = await this.postgres!.queryOne(query, [shareToken]);

      if (!result) {
        return null;
      }

      const typedResult = result as unknown as ShareData;
      const now = new Date();
      const expiresAt = new Date(typedResult.expires_at);
      const expired = now > expiresAt;

      return { ...typedResult, expired };

    } catch (error: any) {
      log.error('[SubtitlerShareService] Failed to get share:', error);
      throw new Error(`Failed to get share: ${error.message}`);
    }
  }

  async getUserShares(userId: string): Promise<ShareData[]> {
    await this.ensureInitialized();

    try {
      const query = `
        SELECT id, share_token, title, thumbnail_path, duration,
               expires_at, download_count, created_at, status
        FROM subtitler_shared_videos
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 50
      `;

      const results = await this.postgres!.query(query, [userId]);

      const now = new Date();
      return results.map((row: any) => ({
        ...row,
        expired: new Date(row.expires_at) < now
      }));

    } catch (error: any) {
      log.error('[SubtitlerShareService] Failed to get user shares:', error);
      throw new Error(`Failed to get user shares: ${error.message}`);
    }
  }

  async recordDownload(shareToken: string, email: string, ipAddress: string): Promise<boolean> {
    await this.ensureInitialized();

    try {
      const share = await this.getShareByToken(shareToken);
      if (!share || share.expired) {
        throw new Error('Share not found or expired');
      }

      const insertQuery = `
        INSERT INTO subtitler_share_downloads (shared_video_id, email, ip_address)
        VALUES ($1, $2, $3)
      `;
      await this.postgres!.query(insertQuery, [share.id, email, ipAddress]);

      const updateQuery = `
        UPDATE subtitler_shared_videos
        SET download_count = download_count + 1
        WHERE id = $1
      `;
      await this.postgres!.query(updateQuery, [share.id]);

      log.info(`[SubtitlerShareService] Recorded download for ${shareToken} by ${email}`);

      return true;

    } catch (error: any) {
      log.error('[SubtitlerShareService] Failed to record download:', error);
      throw new Error(`Failed to record download: ${error.message}`);
    }
  }

  async deleteShare(userId: string, shareToken: string): Promise<boolean> {
    await this.ensureInitialized();

    try {
      const query = `
        SELECT id, video_path, thumbnail_path
        FROM subtitler_shared_videos
        WHERE share_token = $1 AND user_id = $2
      `;
      const share = await this.postgres!.queryOne(query, [shareToken, userId]);

      if (!share) {
        throw new Error('Share not found or not owned by user');
      }

      const deleteQuery = `DELETE FROM subtitler_shared_videos WHERE id = $1`;
      await this.postgres!.query(deleteQuery, [share.id]);

      const shareDir = path.join(SHARED_VIDEOS_PATH, shareToken);
      try {
        await fs.rm(shareDir, { recursive: true, force: true });
      } catch (fsError: any) {
        log.warn(`[SubtitlerShareService] Could not delete share directory: ${fsError.message}`);
      }

      log.info(`[SubtitlerShareService] Deleted share ${shareToken}`);

      return true;

    } catch (error: any) {
      log.error('[SubtitlerShareService] Failed to delete share:', error);
      throw new Error(`Failed to delete share: ${error.message}`);
    }
  }

  async createPendingShare(userId: string, params: CreatePendingShareParams): Promise<ShareResult> {
    await this.ensureInitialized();

    const { title, thumbnailPath, duration, projectId, expiresInDays = DEFAULT_EXPIRATION_DAYS } = params;
    const shareToken = this.generateShareToken();
    const shareDir = path.join(SHARED_VIDEOS_PATH, shareToken);

    try {
      await fs.mkdir(shareDir, { recursive: true });

      let relativeThumbnailPath: string | null = null;
      if (thumbnailPath) {
        try {
          await fs.access(thumbnailPath);
          const targetThumbnailPath = path.join(shareDir, 'thumbnail.jpg');
          await fs.copyFile(thumbnailPath, targetThumbnailPath);
          relativeThumbnailPath = `${shareToken}/thumbnail.jpg`;
        } catch {
          log.debug('[SubtitlerShareService] No thumbnail to copy for pending share');
        }
      }

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresInDays);

      const query = `
        INSERT INTO subtitler_shared_videos
        (user_id, project_id, share_token, video_path, video_filename, title, thumbnail_path, duration, expires_at, status)
        VALUES ($1, $2, $3, NULL, NULL, $4, $5, $6, $7, 'rendering')
        RETURNING id, share_token, created_at, expires_at
      `;

      const result = await this.postgres!.queryOne(query, [
        userId,
        projectId || null,
        shareToken,
        title || 'Untertiteltes Video',
        relativeThumbnailPath,
        duration || null,
        expiresAt.toISOString()
      ]);

      log.info(`[SubtitlerShareService] Created pending share ${shareToken} for user ${userId}`);

      const typedResult = result as { id: string; share_token: string; created_at: Date; expires_at: Date };
      return {
        id: typedResult.id,
        shareToken: typedResult.share_token,
        shareUrl: `/subtitler/share/${shareToken}`,
        createdAt: typedResult.created_at,
        expiresAt: typedResult.expires_at,
        status: 'rendering'
      };

    } catch (error: any) {
      try {
        await fs.rm(shareDir, { recursive: true, force: true });
      } catch {}
      log.error('[SubtitlerShareService] Failed to create pending share:', error);
      throw new Error(`Failed to create pending share: ${error.message}`);
    }
  }

  async finalizeShare(shareToken: string, videoPath: string): Promise<void> {
    await this.ensureInitialized();

    try {
      const shareDir = path.join(SHARED_VIDEOS_PATH, shareToken);
      const targetVideoPath = path.join(shareDir, 'video.mp4');
      await fs.copyFile(videoPath, targetVideoPath);

      const query = `
        UPDATE subtitler_shared_videos
        SET video_path = $1, video_filename = 'video.mp4', status = 'ready'
        WHERE share_token = $2
      `;
      await this.postgres!.query(query, [`${shareToken}/video.mp4`, shareToken]);

      log.info(`[SubtitlerShareService] Finalized share ${shareToken}`);

    } catch (error: any) {
      log.error('[SubtitlerShareService] Failed to finalize share:', error);
      throw new Error(`Failed to finalize share: ${error.message}`);
    }
  }

  async markShareFailed(shareToken: string): Promise<void> {
    await this.ensureInitialized();

    try {
      const query = `UPDATE subtitler_shared_videos SET status = 'failed' WHERE share_token = $1`;
      await this.postgres!.query(query, [shareToken]);
      log.info(`[SubtitlerShareService] Marked share ${shareToken} as failed`);
    } catch (error: any) {
      log.error('[SubtitlerShareService] Failed to mark share as failed:', error);
    }
  }

  getVideoFilePath(relativePath: string): string {
    return path.join(SHARED_VIDEOS_PATH, relativePath);
  }

  getThumbnailFilePath(relativePath: string | null): string | null {
    if (!relativePath) return null;
    return path.join(SHARED_VIDEOS_PATH, relativePath);
  }
}

let serviceInstance: SubtitlerShareService | null = null;

export function getSubtitlerShareService(): SubtitlerShareService {
  if (!serviceInstance) {
    serviceInstance = new SubtitlerShareService();
  }
  return serviceInstance;
}

export default SubtitlerShareService;
export type { CreateShareParams, CreatePendingShareParams, ShareResult, ShareData };
