import { getPostgresInstance } from '../database/services/PostgresService.js';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createCanvas, loadImage } from 'canvas';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SHARED_MEDIA_PATH = path.join(__dirname, '../uploads/shared-media');
const MAX_ITEMS_PER_USER = 50;
const THUMBNAIL_SIZE = 400;

class SharedMediaService {
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
            await fs.mkdir(SHARED_MEDIA_PATH, { recursive: true });
            console.log('[SharedMediaService] Initialized successfully');
        } catch (error) {
            console.error('[SharedMediaService] Initialization failed:', error);
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

    async enforceUserLimit(userId) {
        await this.ensureInitialized();

        try {
            const countQuery = `SELECT COUNT(*) as count FROM shared_media WHERE user_id = $1`;
            const countResult = await this.postgres.queryOne(countQuery, [userId]);
            const count = parseInt(countResult.count, 10);

            if (count >= MAX_ITEMS_PER_USER) {
                const excessCount = count - MAX_ITEMS_PER_USER + 1;

                const deleteQuery = `
                    WITH oldest AS (
                        SELECT id, share_token, file_path, thumbnail_path
                        FROM shared_media
                        WHERE user_id = $1
                        ORDER BY created_at ASC
                        LIMIT $2
                    )
                    DELETE FROM shared_media
                    WHERE id IN (SELECT id FROM oldest)
                    RETURNING share_token
                `;

                const deleted = await this.postgres.query(deleteQuery, [userId, excessCount]);

                for (const item of deleted) {
                    await this.cleanupShareFiles(item.share_token);
                }

                console.log(`[SharedMediaService] Deleted ${deleted.length} oldest items for user ${userId} (limit enforcement)`);
                return deleted.length;
            }

            return 0;
        } catch (error) {
            console.error('[SharedMediaService] Failed to enforce user limit:', error);
            return 0;
        }
    }

    async cleanupShareFiles(shareToken) {
        try {
            const shareDir = path.join(SHARED_MEDIA_PATH, shareToken);
            await fs.rm(shareDir, { recursive: true, force: true });
        } catch (error) {
            console.warn(`[SharedMediaService] Could not cleanup files for ${shareToken}:`, error.message);
        }
    }

    async getUserShareCount(userId) {
        await this.ensureInitialized();
        const query = `SELECT COUNT(*) as count FROM shared_media WHERE user_id = $1`;
        const result = await this.postgres.queryOne(query, [userId]);
        return parseInt(result.count, 10);
    }

    async createVideoShare(userId, { videoPath, title, thumbnailPath, duration, projectId }) {
        await this.ensureInitialized();
        await this.enforceUserLimit(userId);

        const shareToken = this.generateShareToken();
        const shareDir = path.join(SHARED_MEDIA_PATH, shareToken);

        try {
            await fs.mkdir(shareDir, { recursive: true });

            const targetVideoPath = path.join(shareDir, 'media.mp4');
            await fs.copyFile(videoPath, targetVideoPath);

            const stats = await fs.stat(targetVideoPath);
            const videoFilename = path.basename(videoPath);
            const relativeVideoPath = `${shareToken}/media.mp4`;

            let relativeThumbnailPath = null;
            if (thumbnailPath) {
                try {
                    await fs.access(thumbnailPath);
                    const targetThumbnailPath = path.join(shareDir, 'thumbnail.jpg');
                    await fs.copyFile(thumbnailPath, targetThumbnailPath);
                    relativeThumbnailPath = `${shareToken}/thumbnail.jpg`;
                } catch {
                    console.log('[SharedMediaService] No thumbnail to copy');
                }
            }

            const query = `
                INSERT INTO shared_media
                (user_id, share_token, media_type, title, file_path, file_name, thumbnail_path,
                 file_size, mime_type, duration, project_id, status)
                VALUES ($1, $2, 'video', $3, $4, $5, $6, $7, 'video/mp4', $8, $9, 'ready')
                RETURNING id, share_token, created_at
            `;

            const result = await this.postgres.queryOne(query, [
                userId,
                shareToken,
                title || 'Geteiltes Video',
                relativeVideoPath,
                videoFilename,
                relativeThumbnailPath,
                stats.size,
                duration || null,
                projectId || null
            ]);

            console.log(`[SharedMediaService] Created video share ${shareToken} for user ${userId}`);

            return {
                id: result.id,
                shareToken: result.share_token,
                shareUrl: `/share/${shareToken}`,
                createdAt: result.created_at,
                mediaType: 'video'
            };

        } catch (error) {
            try {
                await fs.rm(shareDir, { recursive: true, force: true });
            } catch {}
            console.error('[SharedMediaService] Failed to create video share:', error);
            throw new Error(`Failed to create video share: ${error.message}`);
        }
    }

    async createImageShare(userId, { imageBase64, title, imageType, metadata = {}, originalImage = null }) {
        await this.ensureInitialized();
        await this.enforceUserLimit(userId);

        const shareToken = this.generateShareToken();
        const shareDir = path.join(SHARED_MEDIA_PATH, shareToken);

        try {
            await fs.mkdir(shareDir, { recursive: true });

            const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
            const imageBuffer = Buffer.from(base64Data, 'base64');

            const mimeType = imageBase64.startsWith('data:image/jpeg') ? 'image/jpeg' : 'image/png';
            const extension = mimeType === 'image/jpeg' ? 'jpg' : 'png';

            const targetImagePath = path.join(shareDir, `media.${extension}`);
            await fs.writeFile(targetImagePath, imageBuffer);

            let originalImageFilename = null;
            if (originalImage) {
                const origBase64Data = originalImage.replace(/^data:image\/\w+;base64,/, '');
                const origBuffer = Buffer.from(origBase64Data, 'base64');
                const origMimeType = originalImage.startsWith('data:image/jpeg') ? 'image/jpeg' : 'image/png';
                const origExtension = origMimeType === 'image/jpeg' ? 'jpg' : 'png';
                originalImageFilename = `original.${origExtension}`;
                const targetOriginalPath = path.join(shareDir, originalImageFilename);
                await fs.writeFile(targetOriginalPath, origBuffer);
            }

            const image = await loadImage(targetImagePath);
            const imageInfo = { width: image.width, height: image.height };

            const scale = Math.min(THUMBNAIL_SIZE / image.width, THUMBNAIL_SIZE / image.height, 1);
            const thumbWidth = Math.round(image.width * scale);
            const thumbHeight = Math.round(image.height * scale);

            const canvas = createCanvas(thumbWidth, thumbHeight);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(image, 0, 0, thumbWidth, thumbHeight);

            const thumbnailBuffer = canvas.toBuffer('image/jpeg', { quality: 0.8 });

            const targetThumbnailPath = path.join(shareDir, 'thumbnail.jpg');
            await fs.writeFile(targetThumbnailPath, thumbnailBuffer);

            const relativeImagePath = `${shareToken}/media.${extension}`;
            const relativeThumbnailPath = `${shareToken}/thumbnail.jpg`;

            const enrichedMetadata = {
                ...metadata,
                width: imageInfo.width,
                height: imageInfo.height,
                hasOriginalImage: !!originalImage,
                originalImageFilename: originalImageFilename,
                generatedAt: new Date().toISOString()
            };

            const query = `
                INSERT INTO shared_media
                (user_id, share_token, media_type, title, file_path, file_name, thumbnail_path,
                 file_size, mime_type, image_type, image_metadata, status)
                VALUES ($1, $2, 'image', $3, $4, $5, $6, $7, $8, $9, $10, 'ready')
                RETURNING id, share_token, created_at
            `;

            const result = await this.postgres.queryOne(query, [
                userId,
                shareToken,
                title || 'Geteiltes Bild',
                relativeImagePath,
                `media.${extension}`,
                relativeThumbnailPath,
                imageBuffer.length,
                mimeType,
                imageType || null,
                JSON.stringify(enrichedMetadata)
            ]);

            console.log(`[SharedMediaService] Created image share ${shareToken} for user ${userId}${originalImage ? ' (with original)' : ''}`);

            return {
                id: result.id,
                shareToken: result.share_token,
                shareUrl: `/share/${shareToken}`,
                createdAt: result.created_at,
                mediaType: 'image',
                hasOriginalImage: !!originalImage
            };

        } catch (error) {
            try {
                await fs.rm(shareDir, { recursive: true, force: true });
            } catch {}
            console.error('[SharedMediaService] Failed to create image share:', error);
            throw new Error(`Failed to create image share: ${error.message}`);
        }
    }

    async createPendingVideoShare(userId, { title, thumbnailPath, duration, projectId }) {
        await this.ensureInitialized();
        await this.enforceUserLimit(userId);

        const shareToken = this.generateShareToken();
        const shareDir = path.join(SHARED_MEDIA_PATH, shareToken);

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
                    console.log('[SharedMediaService] No thumbnail to copy for pending share');
                }
            }

            const query = `
                INSERT INTO shared_media
                (user_id, share_token, media_type, title, file_path, file_name, thumbnail_path,
                 mime_type, duration, project_id, status)
                VALUES ($1, $2, 'video', $3, NULL, NULL, $4, 'video/mp4', $5, $6, 'processing')
                RETURNING id, share_token, created_at
            `;

            const result = await this.postgres.queryOne(query, [
                userId,
                shareToken,
                title || 'Geteiltes Video',
                relativeThumbnailPath,
                duration || null,
                projectId || null
            ]);

            console.log(`[SharedMediaService] Created pending video share ${shareToken} for user ${userId}`);

            return {
                id: result.id,
                shareToken: result.share_token,
                shareUrl: `/share/${shareToken}`,
                createdAt: result.created_at,
                mediaType: 'video',
                status: 'processing'
            };

        } catch (error) {
            try {
                await fs.rm(shareDir, { recursive: true, force: true });
            } catch {}
            console.error('[SharedMediaService] Failed to create pending video share:', error);
            throw new Error(`Failed to create pending video share: ${error.message}`);
        }
    }

    async finalizeVideoShare(shareToken, videoPath) {
        await this.ensureInitialized();

        try {
            const shareDir = path.join(SHARED_MEDIA_PATH, shareToken);
            const targetVideoPath = path.join(shareDir, 'media.mp4');
            await fs.copyFile(videoPath, targetVideoPath);

            const stats = await fs.stat(targetVideoPath);

            const query = `
                UPDATE shared_media
                SET file_path = $1, file_name = 'media.mp4', file_size = $2, status = 'ready'
                WHERE share_token = $3
            `;
            await this.postgres.query(query, [`${shareToken}/media.mp4`, stats.size, shareToken]);

            console.log(`[SharedMediaService] Finalized video share ${shareToken}`);

        } catch (error) {
            console.error('[SharedMediaService] Failed to finalize video share:', error);
            throw new Error(`Failed to finalize video share: ${error.message}`);
        }
    }

    async markShareFailed(shareToken) {
        await this.ensureInitialized();

        try {
            const query = `UPDATE shared_media SET status = 'failed' WHERE share_token = $1`;
            await this.postgres.query(query, [shareToken]);
            console.log(`[SharedMediaService] Marked share ${shareToken} as failed`);
        } catch (error) {
            console.error('[SharedMediaService] Failed to mark share as failed:', error);
        }
    }

    async getShareByToken(shareToken) {
        await this.ensureInitialized();

        try {
            const query = `
                SELECT sm.id, sm.user_id, sm.share_token, sm.media_type, sm.title,
                       sm.file_path, sm.file_name, sm.thumbnail_path, sm.file_size, sm.mime_type,
                       sm.duration, sm.project_id, sm.image_type, sm.image_metadata,
                       sm.status, sm.download_count, sm.view_count, sm.created_at,
                       COALESCE(p.first_name, p.display_name, 'Jemand') as sharer_name
                FROM shared_media sm
                LEFT JOIN profiles p ON sm.user_id = p.id
                WHERE sm.share_token = $1
            `;

            const result = await this.postgres.queryOne(query, [shareToken]);

            if (!result) {
                return null;
            }

            return result;

        } catch (error) {
            console.error('[SharedMediaService] Failed to get share:', error);
            throw new Error(`Failed to get share: ${error.message}`);
        }
    }

    async getUserShares(userId, mediaType = null) {
        await this.ensureInitialized();

        try {
            let query = `
                SELECT id, share_token, media_type, title, thumbnail_path, file_size,
                       duration, image_type, status, download_count, created_at
                FROM shared_media
                WHERE user_id = $1
            `;
            const params = [userId];

            if (mediaType) {
                query += ` AND media_type = $2`;
                params.push(mediaType);
            }

            query += ` ORDER BY created_at DESC LIMIT 100`;

            const results = await this.postgres.query(query, params);
            return results;

        } catch (error) {
            console.error('[SharedMediaService] Failed to get user shares:', error);
            throw new Error(`Failed to get user shares: ${error.message}`);
        }
    }

    async recordDownload(shareToken, email, ipAddress) {
        await this.ensureInitialized();

        try {
            const share = await this.getShareByToken(shareToken);
            if (!share) {
                throw new Error('Share not found');
            }

            const insertQuery = `
                INSERT INTO shared_media_downloads (shared_media_id, downloader_email, ip_address)
                VALUES ($1, $2, $3)
            `;
            await this.postgres.query(insertQuery, [share.id, email, ipAddress]);

            const updateQuery = `
                UPDATE shared_media
                SET download_count = download_count + 1
                WHERE id = $1
            `;
            await this.postgres.query(updateQuery, [share.id]);

            console.log(`[SharedMediaService] Recorded download for ${shareToken} by ${email}`);

            return true;

        } catch (error) {
            console.error('[SharedMediaService] Failed to record download:', error);
            throw new Error(`Failed to record download: ${error.message}`);
        }
    }

    async recordView(shareToken) {
        await this.ensureInitialized();

        try {
            const query = `
                UPDATE shared_media
                SET view_count = view_count + 1
                WHERE share_token = $1
            `;
            await this.postgres.query(query, [shareToken]);
        } catch (error) {
            console.warn('[SharedMediaService] Failed to record view:', error.message);
        }
    }

    async deleteShare(userId, shareToken) {
        await this.ensureInitialized();

        try {
            const query = `
                SELECT id, file_path, thumbnail_path
                FROM shared_media
                WHERE share_token = $1 AND user_id = $2
            `;
            const share = await this.postgres.queryOne(query, [shareToken, userId]);

            if (!share) {
                throw new Error('Share not found or not owned by user');
            }

            const deleteQuery = `DELETE FROM shared_media WHERE id = $1`;
            await this.postgres.query(deleteQuery, [share.id]);

            await this.cleanupShareFiles(shareToken);

            console.log(`[SharedMediaService] Deleted share ${shareToken}`);

            return true;

        } catch (error) {
            console.error('[SharedMediaService] Failed to delete share:', error);
            throw new Error(`Failed to delete share: ${error.message}`);
        }
    }

    getMediaFilePath(relativePath) {
        if (!relativePath) return null;
        return path.join(SHARED_MEDIA_PATH, relativePath);
    }

    getThumbnailFilePath(relativePath) {
        if (!relativePath) return null;
        return path.join(SHARED_MEDIA_PATH, relativePath);
    }

    getOriginalImagePath(shareToken, filename) {
        if (!shareToken || !filename) return null;
        return path.join(SHARED_MEDIA_PATH, shareToken, filename);
    }

    async updateImageShare(userId, shareToken, { imageBase64, title, metadata = {}, originalImage = null }) {
        await this.ensureInitialized();

        try {
            const existingShare = await this.postgres.queryOne(
                'SELECT id, file_path, image_metadata FROM shared_media WHERE share_token = $1 AND user_id = $2',
                [shareToken, userId]
            );

            if (!existingShare) {
                throw new Error('Share not found or not owned by user');
            }

            const shareDir = path.join(SHARED_MEDIA_PATH, shareToken);

            const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
            const imageBuffer = Buffer.from(base64Data, 'base64');

            const mimeType = imageBase64.startsWith('data:image/jpeg') ? 'image/jpeg' : 'image/png';
            const extension = mimeType === 'image/jpeg' ? 'jpg' : 'png';

            const targetImagePath = path.join(shareDir, `media.${extension}`);
            await fs.writeFile(targetImagePath, imageBuffer);

            let originalImageFilename = null;
            const existingMetadata = existingShare.image_metadata || {};

            if (originalImage) {
                const origBase64Data = originalImage.replace(/^data:image\/\w+;base64,/, '');
                const origBuffer = Buffer.from(origBase64Data, 'base64');
                const origMimeType = originalImage.startsWith('data:image/jpeg') ? 'image/jpeg' : 'image/png';
                const origExtension = origMimeType === 'image/jpeg' ? 'jpg' : 'png';
                originalImageFilename = `original.${origExtension}`;
                const targetOriginalPath = path.join(shareDir, originalImageFilename);
                await fs.writeFile(targetOriginalPath, origBuffer);
            } else {
                originalImageFilename = existingMetadata.originalImageFilename || null;
            }

            const image = await loadImage(targetImagePath);
            const imageInfo = { width: image.width, height: image.height };

            const scale = Math.min(THUMBNAIL_SIZE / image.width, THUMBNAIL_SIZE / image.height, 1);
            const thumbWidth = Math.round(image.width * scale);
            const thumbHeight = Math.round(image.height * scale);

            const canvas = createCanvas(thumbWidth, thumbHeight);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(image, 0, 0, thumbWidth, thumbHeight);

            const thumbnailBuffer = canvas.toBuffer('image/jpeg', { quality: 0.8 });
            const targetThumbnailPath = path.join(shareDir, 'thumbnail.jpg');
            await fs.writeFile(targetThumbnailPath, thumbnailBuffer);

            const enrichedMetadata = {
                ...metadata,
                width: imageInfo.width,
                height: imageInfo.height,
                hasOriginalImage: !!originalImageFilename,
                originalImageFilename: originalImageFilename,
                updatedAt: new Date().toISOString()
            };

            const relativeImagePath = `${shareToken}/media.${extension}`;

            const query = `
                UPDATE shared_media
                SET title = $1, file_path = $2, file_name = $3, file_size = $4,
                    mime_type = $5, image_metadata = $6
                WHERE id = $7
                RETURNING id, share_token
            `;

            await this.postgres.queryOne(query, [
                title || existingShare.title || 'Geteiltes Bild',
                relativeImagePath,
                `media.${extension}`,
                imageBuffer.length,
                mimeType,
                JSON.stringify(enrichedMetadata),
                existingShare.id
            ]);

            console.log(`[SharedMediaService] Updated image share ${shareToken}`);

            return {
                shareToken: shareToken,
                shareUrl: `/share/${shareToken}`,
                mediaType: 'image',
                hasOriginalImage: !!originalImageFilename
            };

        } catch (error) {
            console.error('[SharedMediaService] Failed to update image share:', error);
            throw new Error(`Failed to update image share: ${error.message}`);
        }
    }
}

let serviceInstance = null;

export function getSharedMediaService() {
    if (!serviceInstance) {
        serviceInstance = new SharedMediaService();
    }
    return serviceInstance;
}

export default SharedMediaService;
