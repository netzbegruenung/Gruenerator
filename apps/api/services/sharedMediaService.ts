import { getPostgresInstance } from '../database/services/PostgresService.js';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createCanvas, loadImage, type Image, type Canvas } from 'canvas';

import type {
    SharedMediaRow,
    CreateVideoShareParams,
    CreatePendingVideoShareParams,
    CreateImageShareParams,
    UpdateImageShareParams,
    UploadMediaFileParams,
    UpdateMediaMetadataParams,
    MediaLibraryFiltersInternal,
    ShareResult,
    MediaLibraryResult,
    MetadataUpdateResult,
    ImageInfo,
    EnrichedImageMetadata,
    MimeToExtensionMap
} from '../types/media.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SHARED_MEDIA_PATH = path.join(__dirname, '../uploads/shared-media');
const MAX_ITEMS_PER_USER = 50;
const THUMBNAIL_SIZE = 400;

interface PostgresInstance {
    ensureInitialized(): Promise<void>;
    query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
    queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null>;
}

class SharedMediaService {
    private postgres: PostgresInstance | null = null;
    private initPromise: Promise<void> | null = null;

    async init(): Promise<void> {
        if (!this.initPromise) {
            this.initPromise = this._init();
        }
        return this.initPromise;
    }

    private async _init(): Promise<void> {
        try {
            this.postgres = getPostgresInstance() as unknown as PostgresInstance;
            await this.postgres.ensureInitialized();
            await fs.mkdir(SHARED_MEDIA_PATH, { recursive: true });
            console.log('[SharedMediaService] Initialized successfully');
        } catch (error) {
            console.error('[SharedMediaService] Initialization failed:', error);
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

    async enforceUserLimit(userId: string): Promise<number> {
        await this.ensureInitialized();

        try {
            const countQuery = `SELECT COUNT(*) as count FROM shared_media WHERE user_id = $1`;
            const countResult = await this.postgres!.queryOne<{ count: string }>(countQuery, [userId]);
            const count = parseInt(countResult?.count ?? '0', 10);

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

                const deleted = await this.postgres!.query<{ share_token: string }>(deleteQuery, [userId, excessCount]);

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

    async cleanupShareFiles(shareToken: string): Promise<void> {
        try {
            const shareDir = path.join(SHARED_MEDIA_PATH, shareToken);
            await fs.rm(shareDir, { recursive: true, force: true });
        } catch (error) {
            console.warn(`[SharedMediaService] Could not cleanup files for ${shareToken}:`, (error as Error).message);
        }
    }

    async getUserShareCount(userId: string): Promise<number> {
        await this.ensureInitialized();
        const query = `SELECT COUNT(*) as count FROM shared_media WHERE user_id = $1`;
        const result = await this.postgres!.queryOne<{ count: string }>(query, [userId]);
        return parseInt(result?.count ?? '0', 10);
    }

    async createVideoShare(userId: string, params: CreateVideoShareParams): Promise<ShareResult> {
        await this.ensureInitialized();
        await this.enforceUserLimit(userId);

        const { videoPath, title, thumbnailPath, duration, projectId } = params;
        const shareToken = this.generateShareToken();
        const shareDir = path.join(SHARED_MEDIA_PATH, shareToken);

        try {
            await fs.mkdir(shareDir, { recursive: true });

            const targetVideoPath = path.join(shareDir, 'media.mp4');
            await fs.copyFile(videoPath, targetVideoPath);

            const stats = await fs.stat(targetVideoPath);
            const videoFilename = path.basename(videoPath);
            const relativeVideoPath = `${shareToken}/media.mp4`;

            let relativeThumbnailPath: string | null = null;
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

            const result = await this.postgres!.queryOne<{ id: string; share_token: string; created_at: Date }>(query, [
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
                id: result!.id,
                shareToken: result!.share_token,
                shareUrl: `/share/${shareToken}`,
                createdAt: result!.created_at,
                mediaType: 'video'
            };

        } catch (error) {
            try {
                await fs.rm(shareDir, { recursive: true, force: true });
            } catch { /* ignore cleanup errors */ }
            console.error('[SharedMediaService] Failed to create video share:', error);
            throw new Error(`Failed to create video share: ${(error as Error).message}`);
        }
    }

    async createImageShare(userId: string, params: CreateImageShareParams): Promise<ShareResult> {
        await this.ensureInitialized();
        await this.enforceUserLimit(userId);

        const { imageBase64, title, imageType, metadata = {}, originalImage = null } = params;
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

            let originalImageFilename: string | null = null;
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
            const imageInfo: ImageInfo = { width: image.width, height: image.height };

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

            const enrichedMetadata: EnrichedImageMetadata = {
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

            const result = await this.postgres!.queryOne<{ id: string; share_token: string; created_at: Date }>(query, [
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
                id: result!.id,
                shareToken: result!.share_token,
                shareUrl: `/share/${shareToken}`,
                createdAt: result!.created_at,
                mediaType: 'image',
                hasOriginalImage: !!originalImage
            };

        } catch (error) {
            try {
                await fs.rm(shareDir, { recursive: true, force: true });
            } catch { /* ignore cleanup errors */ }
            console.error('[SharedMediaService] Failed to create image share:', error);
            throw new Error(`Failed to create image share: ${(error as Error).message}`);
        }
    }

    async createPendingVideoShare(userId: string, params: CreatePendingVideoShareParams): Promise<ShareResult> {
        await this.ensureInitialized();
        await this.enforceUserLimit(userId);

        const { title, thumbnailPath, duration, projectId } = params;
        const shareToken = this.generateShareToken();
        const shareDir = path.join(SHARED_MEDIA_PATH, shareToken);

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

            const result = await this.postgres!.queryOne<{ id: string; share_token: string; created_at: Date }>(query, [
                userId,
                shareToken,
                title || 'Geteiltes Video',
                relativeThumbnailPath,
                duration || null,
                projectId || null
            ]);

            console.log(`[SharedMediaService] Created pending video share ${shareToken} for user ${userId}`);

            return {
                id: result!.id,
                shareToken: result!.share_token,
                shareUrl: `/share/${shareToken}`,
                createdAt: result!.created_at,
                mediaType: 'video',
                status: 'processing'
            };

        } catch (error) {
            try {
                await fs.rm(shareDir, { recursive: true, force: true });
            } catch { /* ignore cleanup errors */ }
            console.error('[SharedMediaService] Failed to create pending video share:', error);
            throw new Error(`Failed to create pending video share: ${(error as Error).message}`);
        }
    }

    async finalizeVideoShare(shareToken: string, videoPath: string): Promise<void> {
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
            await this.postgres!.query(query, [`${shareToken}/media.mp4`, stats.size, shareToken]);

            console.log(`[SharedMediaService] Finalized video share ${shareToken}`);

        } catch (error) {
            console.error('[SharedMediaService] Failed to finalize video share:', error);
            throw new Error(`Failed to finalize video share: ${(error as Error).message}`);
        }
    }

    async markShareFailed(shareToken: string): Promise<void> {
        await this.ensureInitialized();

        try {
            const query = `UPDATE shared_media SET status = 'failed' WHERE share_token = $1`;
            await this.postgres!.query(query, [shareToken]);
            console.log(`[SharedMediaService] Marked share ${shareToken} as failed`);
        } catch (error) {
            console.error('[SharedMediaService] Failed to mark share as failed:', error);
        }
    }

    async getShareByToken(shareToken: string): Promise<SharedMediaRow | null> {
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

            const result = await this.postgres!.queryOne<SharedMediaRow>(query, [shareToken]);

            if (!result) {
                return null;
            }

            return result;

        } catch (error) {
            console.error('[SharedMediaService] Failed to get share:', error);
            throw new Error(`Failed to get share: ${(error as Error).message}`);
        }
    }

    async getUserShares(userId: string, mediaType: 'image' | 'video' | null = null): Promise<SharedMediaRow[]> {
        await this.ensureInitialized();

        try {
            let query = `
                SELECT id, share_token, media_type, title, thumbnail_path, file_size,
                       duration, image_type, status, download_count, created_at
                FROM shared_media
                WHERE user_id = $1
            `;
            const params: unknown[] = [userId];

            if (mediaType) {
                query += ` AND media_type = $2`;
                params.push(mediaType);
            }

            query += ` ORDER BY created_at DESC LIMIT 100`;

            const results = await this.postgres!.query<SharedMediaRow>(query, params);
            return results;

        } catch (error) {
            console.error('[SharedMediaService] Failed to get user shares:', error);
            throw new Error(`Failed to get user shares: ${(error as Error).message}`);
        }
    }

    async recordDownload(shareToken: string, email: string, ipAddress: string): Promise<boolean> {
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
            await this.postgres!.query(insertQuery, [share.id, email, ipAddress]);

            const updateQuery = `
                UPDATE shared_media
                SET download_count = download_count + 1
                WHERE id = $1
            `;
            await this.postgres!.query(updateQuery, [share.id]);

            console.log(`[SharedMediaService] Recorded download for ${shareToken} by ${email}`);

            return true;

        } catch (error) {
            console.error('[SharedMediaService] Failed to record download:', error);
            throw new Error(`Failed to record download: ${(error as Error).message}`);
        }
    }

    async recordView(shareToken: string): Promise<void> {
        await this.ensureInitialized();

        try {
            const query = `
                UPDATE shared_media
                SET view_count = view_count + 1
                WHERE share_token = $1
            `;
            await this.postgres!.query(query, [shareToken]);
        } catch (error) {
            console.warn('[SharedMediaService] Failed to record view:', (error as Error).message);
        }
    }

    async deleteShare(userId: string, shareToken: string): Promise<boolean> {
        await this.ensureInitialized();

        try {
            const query = `
                SELECT id, file_path, thumbnail_path
                FROM shared_media
                WHERE share_token = $1 AND user_id = $2
            `;
            const share = await this.postgres!.queryOne<{ id: string; file_path: string; thumbnail_path: string }>(query, [shareToken, userId]);

            if (!share) {
                throw new Error('Share not found or not owned by user');
            }

            const deleteQuery = `DELETE FROM shared_media WHERE id = $1`;
            await this.postgres!.query(deleteQuery, [share.id]);

            await this.cleanupShareFiles(shareToken);

            console.log(`[SharedMediaService] Deleted share ${shareToken}`);

            return true;

        } catch (error) {
            console.error('[SharedMediaService] Failed to delete share:', error);
            throw new Error(`Failed to delete share: ${(error as Error).message}`);
        }
    }

    getMediaFilePath(relativePath: string | null): string | null {
        if (!relativePath) return null;
        return path.join(SHARED_MEDIA_PATH, relativePath);
    }

    getThumbnailFilePath(relativePath: string | null): string | null {
        if (!relativePath) return null;
        return path.join(SHARED_MEDIA_PATH, relativePath);
    }

    getOriginalImagePath(shareToken: string, filename: string): string | null {
        if (!shareToken || !filename) return null;
        return path.join(SHARED_MEDIA_PATH, shareToken, filename);
    }

    async getMediaLibrary(userId: string, filters: Partial<MediaLibraryFiltersInternal> = {}): Promise<MediaLibraryResult> {
        await this.ensureInitialized();

        const {
            type = 'all',
            search = null,
            limit = 50,
            offset = 0,
            sort = 'newest'
        } = filters;

        try {
            let query = `
                SELECT id, share_token, media_type, title, thumbnail_path, file_size,
                       mime_type, duration, image_type, image_metadata, status,
                       download_count, view_count, created_at, alt_text, upload_source,
                       original_filename
                FROM shared_media
                WHERE user_id = $1
                  AND status = 'ready'
                  AND COALESCE(is_library_item, TRUE) = TRUE
            `;
            const params: unknown[] = [userId];
            let paramIndex = 2;

            if (type && type !== 'all') {
                query += ` AND media_type = $${paramIndex}`;
                params.push(type);
                paramIndex++;
            }

            if (search) {
                query += ` AND (title ILIKE $${paramIndex} OR alt_text ILIKE $${paramIndex})`;
                params.push(`%${search}%`);
                paramIndex++;
            }

            query += sort === 'oldest'
                ? ` ORDER BY created_at ASC`
                : ` ORDER BY created_at DESC`;

            query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
            params.push(limit, offset);

            const results = await this.postgres!.query<SharedMediaRow>(query, params);

            const countQuery = `
                SELECT COUNT(*) as total
                FROM shared_media
                WHERE user_id = $1
                  AND status = 'ready'
                  AND COALESCE(is_library_item, TRUE) = TRUE
                  ${type && type !== 'all' ? 'AND media_type = $2' : ''}
            `;
            const countParams = type && type !== 'all' ? [userId, type] : [userId];
            const countResult = await this.postgres!.queryOne<{ total: string }>(countQuery, countParams);

            return {
                items: results,
                total: parseInt(countResult?.total ?? '0', 10),
                limit,
                offset
            };

        } catch (error) {
            console.error('[SharedMediaService] Failed to get media library:', error);
            throw new Error(`Failed to get media library: ${(error as Error).message}`);
        }
    }

    async getMediaById(userId: string, mediaId: string): Promise<SharedMediaRow | null> {
        await this.ensureInitialized();

        try {
            const query = `
                SELECT id, share_token, media_type, title, file_path, file_name,
                       thumbnail_path, file_size, mime_type, duration, image_type,
                       image_metadata, status, download_count, view_count, created_at,
                       alt_text, upload_source, original_filename
                FROM shared_media
                WHERE id = $1 AND user_id = $2
            `;
            const result = await this.postgres!.queryOne<SharedMediaRow>(query, [mediaId, userId]);
            return result;
        } catch (error) {
            console.error('[SharedMediaService] Failed to get media by id:', error);
            throw new Error(`Failed to get media: ${(error as Error).message}`);
        }
    }

    async updateMediaMetadata(userId: string, mediaId: string, params: UpdateMediaMetadataParams): Promise<MetadataUpdateResult> {
        await this.ensureInitialized();

        const { title, altText } = params;

        try {
            const updates: string[] = [];
            const queryParams: unknown[] = [];
            let paramIndex = 1;

            if (title !== undefined) {
                updates.push(`title = $${paramIndex}`);
                queryParams.push(title);
                paramIndex++;
            }

            if (altText !== undefined) {
                updates.push(`alt_text = $${paramIndex}`);
                queryParams.push(altText);
                paramIndex++;
            }

            if (updates.length === 0) {
                throw new Error('No fields to update');
            }

            queryParams.push(mediaId, userId);

            const query = `
                UPDATE shared_media
                SET ${updates.join(', ')}
                WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
                RETURNING id, share_token, title, alt_text
            `;

            const result = await this.postgres!.queryOne<MetadataUpdateResult>(query, queryParams);

            if (!result) {
                throw new Error('Media not found or not owned by user');
            }

            console.log(`[SharedMediaService] Updated media metadata for ${result.share_token}`);
            return result;

        } catch (error) {
            console.error('[SharedMediaService] Failed to update media metadata:', error);
            throw new Error(`Failed to update media: ${(error as Error).message}`);
        }
    }

    async uploadMediaFile(userId: string, params: UploadMediaFileParams): Promise<ShareResult> {
        await this.ensureInitialized();
        await this.enforceUserLimit(userId);

        const { fileBuffer, originalFilename, mimeType, title, altText, uploadSource = 'upload' } = params;
        const shareToken = this.generateShareToken();
        const shareDir = path.join(SHARED_MEDIA_PATH, shareToken);

        try {
            await fs.mkdir(shareDir, { recursive: true });

            const isImage = mimeType.startsWith('image/');
            const isVideo = mimeType.startsWith('video/');

            if (!isImage && !isVideo) {
                throw new Error('Unsupported file type. Only images and videos are allowed.');
            }

            const extension = this.getExtensionFromMime(mimeType);
            const targetPath = path.join(shareDir, `media.${extension}`);
            await fs.writeFile(targetPath, fileBuffer);

            const relativeFilePath = `${shareToken}/media.${extension}`;
            let relativeThumbnailPath: string | null = null;
            let imageInfo: ImageInfo | null = null;

            if (isImage) {
                const image = await loadImage(targetPath);
                imageInfo = { width: image.width, height: image.height };

                const scale = Math.min(THUMBNAIL_SIZE / image.width, THUMBNAIL_SIZE / image.height, 1);
                const thumbWidth = Math.round(image.width * scale);
                const thumbHeight = Math.round(image.height * scale);

                const canvas = createCanvas(thumbWidth, thumbHeight);
                const ctx = canvas.getContext('2d');
                ctx.drawImage(image, 0, 0, thumbWidth, thumbHeight);

                const thumbnailBuffer = canvas.toBuffer('image/jpeg', { quality: 0.8 });
                const targetThumbnailPath = path.join(shareDir, 'thumbnail.jpg');
                await fs.writeFile(targetThumbnailPath, thumbnailBuffer);
                relativeThumbnailPath = `${shareToken}/thumbnail.jpg`;
            }

            const query = `
                INSERT INTO shared_media
                (user_id, share_token, media_type, title, file_path, file_name, thumbnail_path,
                 file_size, mime_type, status, is_library_item, alt_text, upload_source, original_filename,
                 image_metadata)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ready', TRUE, $10, $11, $12, $13)
                RETURNING id, share_token, created_at
            `;

            const result = await this.postgres!.queryOne<{ id: string; share_token: string; created_at: Date }>(query, [
                userId,
                shareToken,
                isImage ? 'image' : 'video',
                title || originalFilename || 'Uploaded media',
                relativeFilePath,
                `media.${extension}`,
                relativeThumbnailPath,
                fileBuffer.length,
                mimeType,
                altText || null,
                uploadSource,
                originalFilename,
                imageInfo ? JSON.stringify(imageInfo) : null
            ]);

            console.log(`[SharedMediaService] Uploaded media ${shareToken} for user ${userId}`);

            return {
                id: result!.id,
                shareToken: result!.share_token,
                shareUrl: `/share/${shareToken}`,
                createdAt: result!.created_at,
                mediaType: isImage ? 'image' : 'video'
            };

        } catch (error) {
            try {
                await fs.rm(shareDir, { recursive: true, force: true });
            } catch { /* ignore cleanup errors */ }
            console.error('[SharedMediaService] Failed to upload media:', error);
            throw new Error(`Failed to upload media: ${(error as Error).message}`);
        }
    }

    getExtensionFromMime(mimeType: string): string {
        const mimeToExt: MimeToExtensionMap = {
            'image/jpeg': 'jpg',
            'image/png': 'png',
            'image/webp': 'webp',
            'image/gif': 'gif',
            'video/mp4': 'mp4',
            'video/webm': 'webm',
            'video/quicktime': 'mov'
        };
        return mimeToExt[mimeType] || 'bin';
    }

    async updateImageShare(userId: string, shareToken: string, params: UpdateImageShareParams): Promise<ShareResult> {
        await this.ensureInitialized();

        const { imageBase64, title, metadata = {}, originalImage = null } = params;

        try {
            const existingShare = await this.postgres!.queryOne<{ id: string; file_path: string; image_metadata: Record<string, unknown> | null }>(
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

            let originalImageFilename: string | null = null;
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
                originalImageFilename = (existingMetadata as Record<string, unknown>).originalImageFilename as string | null || null;
            }

            const image = await loadImage(targetImagePath);
            const imageInfo: ImageInfo = { width: image.width, height: image.height };

            const scale = Math.min(THUMBNAIL_SIZE / image.width, THUMBNAIL_SIZE / image.height, 1);
            const thumbWidth = Math.round(image.width * scale);
            const thumbHeight = Math.round(image.height * scale);

            const canvas = createCanvas(thumbWidth, thumbHeight);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(image, 0, 0, thumbWidth, thumbHeight);

            const thumbnailBuffer = canvas.toBuffer('image/jpeg', { quality: 0.8 });
            const targetThumbnailPath = path.join(shareDir, 'thumbnail.jpg');
            await fs.writeFile(targetThumbnailPath, thumbnailBuffer);

            const enrichedMetadata: EnrichedImageMetadata = {
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

            await this.postgres!.queryOne(query, [
                title || (existingShare as Record<string, unknown>).title || 'Geteiltes Bild',
                relativeImagePath,
                `media.${extension}`,
                imageBuffer.length,
                mimeType,
                JSON.stringify(enrichedMetadata),
                existingShare.id
            ]);

            console.log(`[SharedMediaService] Updated image share ${shareToken}`);

            return {
                id: existingShare.id,
                shareToken: shareToken,
                shareUrl: `/share/${shareToken}`,
                createdAt: new Date(),
                mediaType: 'image',
                hasOriginalImage: !!originalImageFilename
            };

        } catch (error) {
            console.error('[SharedMediaService] Failed to update image share:', error);
            throw new Error(`Failed to update image share: ${(error as Error).message}`);
        }
    }
}

let serviceInstance: SharedMediaService | null = null;

export function getSharedMediaService(): SharedMediaService {
    if (!serviceInstance) {
        serviceInstance = new SharedMediaService();
    }
    return serviceInstance;
}

export default SharedMediaService;
