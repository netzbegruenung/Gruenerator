import { getPostgresInstance } from '../../../database/services/PostgresService.js';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SHARED_VIDEOS_PATH = path.join(__dirname, '../../../uploads/shared-videos');
const DEFAULT_EXPIRATION_DAYS = 7;

class SubtitlerShareService {
    constructor() {
        this.postgres = null;
        this.initPromise = null;
    }

    async init() {
        if (!this.initPromise) {
            this.initPromise = this._init();
        }
        return this.initPromise;
    }

    async _init() {
        try {
            this.postgres = getPostgresInstance();
            await this.postgres.ensureInitialized();
            await fs.mkdir(SHARED_VIDEOS_PATH, { recursive: true });
            console.log('[SubtitlerShareService] Initialized successfully');
        } catch (error) {
            console.error('[SubtitlerShareService] Initialization failed:', error);
            throw error;
        }
    }

    async ensureInitialized() {
        if (!this.postgres) {
            await this.init();
        }
    }

    generateShareToken() {
        return crypto.randomBytes(16).toString('hex');
    }

    async createShare(userId, { videoPath, title, thumbnailPath, duration, projectId, expiresInDays = DEFAULT_EXPIRATION_DAYS }) {
        await this.ensureInitialized();

        const shareToken = this.generateShareToken();
        const shareDir = path.join(SHARED_VIDEOS_PATH, shareToken);

        try {
            await fs.mkdir(shareDir, { recursive: true });

            // Copy video to permanent shared storage
            const targetVideoPath = path.join(shareDir, 'video.mp4');
            await fs.copyFile(videoPath, targetVideoPath);

            const videoFilename = path.basename(videoPath);
            const relativeVideoPath = `${shareToken}/video.mp4`;

            // Copy thumbnail if exists
            let relativeThumbnailPath = null;
            if (thumbnailPath) {
                try {
                    await fs.access(thumbnailPath);
                    const targetThumbnailPath = path.join(shareDir, 'thumbnail.jpg');
                    await fs.copyFile(thumbnailPath, targetThumbnailPath);
                    relativeThumbnailPath = `${shareToken}/thumbnail.jpg`;
                } catch {
                    console.log('[SubtitlerShareService] No thumbnail to copy');
                }
            }

            // Calculate expiration
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + expiresInDays);

            // Insert into database
            const query = `
                INSERT INTO subtitler_shared_videos
                (user_id, project_id, share_token, video_path, video_filename, title, thumbnail_path, duration, expires_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING id, share_token, created_at, expires_at
            `;

            const result = await this.postgres.queryOne(query, [
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

            console.log(`[SubtitlerShareService] Created share ${shareToken} for user ${userId}`);

            return {
                id: result.id,
                shareToken: result.share_token,
                shareUrl: `/subtitler/share/${shareToken}`,
                createdAt: result.created_at,
                expiresAt: result.expires_at
            };

        } catch (error) {
            // Cleanup on failure
            try {
                await fs.rm(shareDir, { recursive: true, force: true });
            } catch {}
            console.error('[SubtitlerShareService] Failed to create share:', error);
            throw new Error(`Failed to create share: ${error.message}`);
        }
    }

    async getShareByToken(shareToken) {
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

            const result = await this.postgres.queryOne(query, [shareToken]);

            if (!result) {
                return null;
            }

            // Check if expired
            const now = new Date();
            const expiresAt = new Date(result.expires_at);
            if (now > expiresAt) {
                return { ...result, expired: true };
            }

            return { ...result, expired: false };

        } catch (error) {
            console.error('[SubtitlerShareService] Failed to get share:', error);
            throw new Error(`Failed to get share: ${error.message}`);
        }
    }

    async getUserShares(userId) {
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

            const results = await this.postgres.query(query, [userId]);

            const now = new Date();
            return results.map(row => ({
                ...row,
                expired: new Date(row.expires_at) < now
            }));

        } catch (error) {
            console.error('[SubtitlerShareService] Failed to get user shares:', error);
            throw new Error(`Failed to get user shares: ${error.message}`);
        }
    }

    async recordDownload(shareToken, email, ipAddress) {
        await this.ensureInitialized();

        try {
            // Get the shared video ID
            const share = await this.getShareByToken(shareToken);
            if (!share || share.expired) {
                throw new Error('Share not found or expired');
            }

            // Record the download
            const insertQuery = `
                INSERT INTO subtitler_share_downloads (shared_video_id, email, ip_address)
                VALUES ($1, $2, $3)
            `;
            await this.postgres.query(insertQuery, [share.id, email, ipAddress]);

            // Increment download count
            const updateQuery = `
                UPDATE subtitler_shared_videos
                SET download_count = download_count + 1
                WHERE id = $1
            `;
            await this.postgres.query(updateQuery, [share.id]);

            console.log(`[SubtitlerShareService] Recorded download for ${shareToken} by ${email}`);

            return true;

        } catch (error) {
            console.error('[SubtitlerShareService] Failed to record download:', error);
            throw new Error(`Failed to record download: ${error.message}`);
        }
    }

    async deleteShare(userId, shareToken) {
        await this.ensureInitialized();

        try {
            // Verify ownership
            const query = `
                SELECT id, video_path, thumbnail_path
                FROM subtitler_shared_videos
                WHERE share_token = $1 AND user_id = $2
            `;
            const share = await this.postgres.queryOne(query, [shareToken, userId]);

            if (!share) {
                throw new Error('Share not found or not owned by user');
            }

            // Delete from database (cascade will delete downloads)
            const deleteQuery = `
                DELETE FROM subtitler_shared_videos
                WHERE id = $1
            `;
            await this.postgres.query(deleteQuery, [share.id]);

            // Delete files
            const shareDir = path.join(SHARED_VIDEOS_PATH, shareToken);
            try {
                await fs.rm(shareDir, { recursive: true, force: true });
            } catch (fsError) {
                console.warn(`[SubtitlerShareService] Could not delete share directory: ${fsError.message}`);
            }

            console.log(`[SubtitlerShareService] Deleted share ${shareToken}`);

            return true;

        } catch (error) {
            console.error('[SubtitlerShareService] Failed to delete share:', error);
            throw new Error(`Failed to delete share: ${error.message}`);
        }
    }

    async createPendingShare(userId, { title, thumbnailPath, duration, projectId, expiresInDays = DEFAULT_EXPIRATION_DAYS }) {
        await this.ensureInitialized();

        const shareToken = this.generateShareToken();
        const shareDir = path.join(SHARED_VIDEOS_PATH, shareToken);

        try {
            await fs.mkdir(shareDir, { recursive: true });

            let relativeThumbnailPath = null;
            if (thumbnailPath) {
                try {
                    await fs.access(thumbnailPath);
                    const targetThumbnailPath = path.join(shareDir, 'thumbnail.jpg');
                    await fs.copyFile(thumbnailPath, targetThumbnailPath);
                    relativeThumbnailPath = `${shareToken}/thumbnail.jpg`;
                } catch {
                    console.log('[SubtitlerShareService] No thumbnail to copy for pending share');
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

            const result = await this.postgres.queryOne(query, [
                userId,
                projectId || null,
                shareToken,
                title || 'Untertiteltes Video',
                relativeThumbnailPath,
                duration || null,
                expiresAt.toISOString()
            ]);

            console.log(`[SubtitlerShareService] Created pending share ${shareToken} for user ${userId}`);

            return {
                id: result.id,
                shareToken: result.share_token,
                shareUrl: `/subtitler/share/${shareToken}`,
                createdAt: result.created_at,
                expiresAt: result.expires_at,
                status: 'rendering'
            };

        } catch (error) {
            try {
                await fs.rm(shareDir, { recursive: true, force: true });
            } catch {}
            console.error('[SubtitlerShareService] Failed to create pending share:', error);
            throw new Error(`Failed to create pending share: ${error.message}`);
        }
    }

    async finalizeShare(shareToken, videoPath) {
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
            await this.postgres.query(query, [`${shareToken}/video.mp4`, shareToken]);

            console.log(`[SubtitlerShareService] Finalized share ${shareToken}`);

        } catch (error) {
            console.error('[SubtitlerShareService] Failed to finalize share:', error);
            throw new Error(`Failed to finalize share: ${error.message}`);
        }
    }

    async markShareFailed(shareToken) {
        await this.ensureInitialized();

        try {
            const query = `UPDATE subtitler_shared_videos SET status = 'failed' WHERE share_token = $1`;
            await this.postgres.query(query, [shareToken]);
            console.log(`[SubtitlerShareService] Marked share ${shareToken} as failed`);
        } catch (error) {
            console.error('[SubtitlerShareService] Failed to mark share as failed:', error);
        }
    }

    getVideoFilePath(relativePath) {
        return path.join(SHARED_VIDEOS_PATH, relativePath);
    }

    getThumbnailFilePath(relativePath) {
        if (!relativePath) return null;
        return path.join(SHARED_VIDEOS_PATH, relativePath);
    }
}

// Singleton instance
let serviceInstance = null;

export function getSubtitlerShareService() {
    if (!serviceInstance) {
        serviceInstance = new SubtitlerShareService();
    }
    return serviceInstance;
}

export default SubtitlerShareService;
