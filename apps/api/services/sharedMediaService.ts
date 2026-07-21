import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import { NON_LIBRARY_UPLOAD_SOURCES } from '@gruenerator/shared/media-library/constants';
import { encode as encodeBlurhash } from 'blurhash';
import sharp from 'sharp';

import { type PostgresService, getPostgresInstance } from '../database/services/PostgresService.js';
import { likeContainsPattern } from '../utils/sqlLike.js';

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
  MimeToExtensionMap,
} from '../types/media.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SHARED_MEDIA_PATH = path.join(__dirname, '../uploads/shared-media');
const SHARED_MEDIA_PATH_RESOLVED = path.resolve(SHARED_MEDIA_PATH);
const MAX_ITEMS_PER_USER = 50;
const THUMBNAIL_SIZE = 400;

/**
 * Statuses a user sees in their own creation listings (galleries, recent
 * strips). Canvas autosave writes 'draft' and only an explicit publish
 * promotes to 'ready', so user-facing lists must include drafts — a
 * ready-only filter permanently hides autosaved work. Surfaces that
 * intentionally narrow (the curated media library is ready-only) should pass
 * an explicit status instead of duplicating the policy in raw SQL.
 */
export const USER_VISIBLE_SHARE_STATUSES = ['ready', 'draft'] as const;

// Responsive grid-thumbnail widths pre-generated at upload. Must stay in sync
// with the widths the frontend requests (`buildSharedMediaSrcSet`) and the
// on-demand fallback in shareFileRouter's `/preview` handler.
const VARIANT_WIDTHS = [200, 400, 800] as const;

/**
 * Result of pre-generating responsive thumbnails + a BlurHash for an image.
 */
export interface MediaVariantResult {
  thumbnailPath: string | null; // relative `${shareToken}/thumbnail.jpg`
  blurhash: string | null;
  width: number;
  height: number;
  variants: number[]; // widths actually generated (<= source width)
}

function getSafeShareDir(shareToken: string): string {
  const safeToken = path.basename(shareToken);
  const shareDir = path.join(SHARED_MEDIA_PATH, safeToken);
  const resolvedDir = path.resolve(shareDir);
  if (!resolvedDir.startsWith(SHARED_MEDIA_PATH_RESOLVED + path.sep)) {
    throw new Error('Invalid share token: path traversal detected');
  }
  return shareDir;
}

/**
 * Generate everything the responsive image standard needs from a source image,
 * in one pass with sharp:
 *  - WebP + AVIF variants at {@link VARIANT_WIDTHS} into `<shareDir>/thumbs/`,
 *    named `<base>_w<width>.<fmt>` to match shareFileRouter's `/preview` reader.
 *  - A 400px `thumbnail.jpg` (legacy thumbnail endpoint + poster fallback).
 *  - A compact BlurHash string for an instant placeholder.
 *  - Intrinsic width/height.
 *
 * Only downscales — widths larger than the source are skipped (never upscale).
 * Throws if the source can't be decoded; callers mark the row `failed`.
 */
async function generateMediaVariants(
  shareToken: string,
  sourcePath: string
): Promise<MediaVariantResult> {
  const shareDir = getSafeShareDir(shareToken);
  const thumbsDir = path.join(shareDir, 'thumbs');
  const base = path.basename(sourcePath, path.extname(sourcePath)); // e.g. "media"

  // `failOn: 'none'` keeps slightly-truncated uploads decodable instead of throwing.
  const pipeline = sharp(sourcePath, { failOn: 'none' });
  const meta = await pipeline.metadata();
  const srcWidth = meta.width ?? 0;
  const srcHeight = meta.height ?? 0;
  if (!srcWidth || !srcHeight) {
    throw new Error('generateMediaVariants: could not read image dimensions');
  }

  await fs.mkdir(thumbsDir, { recursive: true });

  // Responsive WebP + AVIF variants (downscale only).
  const widths: number[] = VARIANT_WIDTHS.filter((w) => w <= srcWidth);
  if (widths.length === 0) widths.push(srcWidth); // tiny source: emit one at native width
  const generated: number[] = [];
  for (const width of widths) {
    const resized = sharp(sourcePath, { failOn: 'none' }).resize({
      width,
      withoutEnlargement: true,
    });
    await Promise.all([
      resized
        .clone()
        .webp({ quality: 78 })
        .toFile(path.join(thumbsDir, `${base}_w${width}.webp`)),
      resized
        .clone()
        .avif({ quality: 60 })
        .toFile(path.join(thumbsDir, `${base}_w${width}.avif`)),
    ]);
    generated.push(width);
  }

  // Legacy 400px JPEG thumbnail (kept for `/thumbnail` + video-poster fallbacks).
  let thumbnailPath: string | null = null;
  try {
    await sharp(sourcePath, { failOn: 'none' })
      .resize({
        width: THUMBNAIL_SIZE,
        height: THUMBNAIL_SIZE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 80 })
      .toFile(path.join(shareDir, 'thumbnail.jpg'));
    thumbnailPath = `${shareToken}/thumbnail.jpg`;
  } catch (err) {
    console.warn('[SharedMediaService] thumbnail.jpg generation failed:', err);
  }

  // BlurHash from a tiny raw-RGBA downscale.
  let blurhash: string | null = null;
  try {
    const { data, info } = await sharp(sourcePath, { failOn: 'none' })
      .raw()
      .ensureAlpha()
      .resize(32, 32, { fit: 'inside' })
      .toBuffer({ resolveWithObject: true });
    blurhash = encodeBlurhash(new Uint8ClampedArray(data), info.width, info.height, 4, 3);
  } catch (err) {
    console.warn('[SharedMediaService] BlurHash encode failed:', err);
  }

  return { thumbnailPath, blurhash, width: srcWidth, height: srcHeight, variants: generated };
}

class SharedMediaService {
  private postgres: PostgresService | null = null;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.initPromise === null) {
      this.initPromise = this._init();
    }
    return this.initPromise;
  }

  private async _init(): Promise<void> {
    try {
      const postgres = getPostgresInstance();
      await postgres.ensureInitialized();
      await fs.mkdir(SHARED_MEDIA_PATH, { recursive: true });
      this.postgres = postgres; // Only set AFTER successful init
      console.log('[SharedMediaService] Initialized successfully');
    } catch (error) {
      console.error('[SharedMediaService] Initialization failed:', error);
      this.initPromise = null; // Reset so subsequent calls can retry
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

  /**
   * Background worker: pre-generate responsive variants + BlurHash for an image
   * and merge the results into its row. Fire-and-forget from the create/upload
   * paths (the row is already usable as `ready`; the `/preview` on-demand
   * fallback covers the brief window before this finishes). Never throws.
   */
  private async processMediaVariants(shareToken: string, sourcePath: string): Promise<void> {
    try {
      const result = await generateMediaVariants(shareToken, sourcePath);
      await this.ensureInitialized();
      await this.postgres!.query(
        `UPDATE shared_media
           SET thumbnail_path = COALESCE($2, thumbnail_path),
               image_metadata = COALESCE(image_metadata, '{}'::jsonb) || $3::jsonb
         WHERE share_token = $1`,
        [
          shareToken,
          result.thumbnailPath,
          JSON.stringify({
            blurhash: result.blurhash,
            width: result.width,
            height: result.height,
            variants: result.variants,
          }),
        ]
      );
    } catch (err) {
      console.error(`[SharedMediaService] Variant generation failed for ${shareToken}:`, err);
    }
  }

  /**
   * Public entry point for the backfill script: (re)generate variants + BlurHash
   * for an existing image share. Resolves the source from the stored file_path.
   * Awaits completion (unlike the fire-and-forget upload path) so backfill can
   * report progress. Returns false when the source file is missing/unreadable.
   */
  async regenerateMediaVariants(shareToken: string, relativeFilePath: string): Promise<boolean> {
    const sourcePath = this.getMediaFilePath(relativeFilePath);
    if (!sourcePath) return false;
    try {
      await fs.access(sourcePath);
    } catch {
      return false;
    }
    await this.processMediaVariants(shareToken, sourcePath);
    return true;
  }

  async enforceUserLimit(userId: string): Promise<number> {
    await this.ensureInitialized();

    try {
      // Internal artifacts (canvas/chat thumbnails, template previews —
      // is_library_item = FALSE) neither count against the user's quota nor
      // get evicted: they are referenced by canvas_documents.thumbnail_url,
      // and evicting one silently blanks that document's gallery preview.
      // Their lifecycle is delete-on-replace in updateCanvas instead.
      const countQuery = `SELECT COUNT(*) as count FROM shared_media
                          WHERE user_id = $1 AND COALESCE(is_library_item, TRUE) = TRUE`;
      const countResult = await this.postgres!.queryOne<{ count: string }>(countQuery, [userId]);
      const count = parseInt(countResult?.count ?? '0', 10);

      if (count >= MAX_ITEMS_PER_USER) {
        const excessCount = count - MAX_ITEMS_PER_USER + 1;

        const deleteQuery = `
                    WITH oldest AS (
                        SELECT id, share_token, file_path, thumbnail_path
                        FROM shared_media
                        WHERE user_id = $1 AND COALESCE(is_library_item, TRUE) = TRUE
                        ORDER BY created_at ASC
                        LIMIT $2
                    )
                    DELETE FROM shared_media
                    WHERE id IN (SELECT id FROM oldest)
                    RETURNING share_token
                `;

        const deleted = await this.postgres!.query<{ share_token: string }>(deleteQuery, [
          userId,
          excessCount,
        ]);

        for (const item of deleted) {
          await this.cleanupShareFiles(item.share_token);
        }

        console.log(
          `[SharedMediaService] Deleted ${deleted.length} oldest items for user ${userId} (limit enforcement)`
        );
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
      const shareDir = getSafeShareDir(shareToken);
      await fs.rm(shareDir, { recursive: true, force: true });
    } catch (error) {
      console.warn(
        '[SharedMediaService] Could not cleanup files for %s:',
        shareToken,
        (error as Error).message
      );
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
    const shareDir = getSafeShareDir(shareToken);

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

      const result = await this.postgres!.queryOne<{
        id: string;
        share_token: string;
        created_at: Date;
      }>(query, [
        userId,
        shareToken,
        title || 'Geteiltes Video',
        relativeVideoPath,
        videoFilename,
        relativeThumbnailPath,
        stats.size,
        duration || null,
        projectId || null,
      ]);

      console.log(`[SharedMediaService] Created video share ${shareToken} for user ${userId}`);

      return {
        id: result!.id,
        shareToken: result!.share_token,
        shareUrl: `/share/${shareToken}`,
        createdAt: result!.created_at,
        mediaType: 'video',
      };
    } catch (error) {
      try {
        await fs.rm(shareDir, { recursive: true, force: true });
      } catch {
        /* ignore cleanup errors */
      }
      console.error('[SharedMediaService] Failed to create video share:', error);
      throw new Error(`Failed to create video share: ${(error as Error).message}`);
    }
  }

  async createImageShare(userId: string, params: CreateImageShareParams): Promise<ShareResult> {
    await this.ensureInitialized();
    await this.enforceUserLimit(userId);

    const {
      imageBase64,
      title,
      imageType,
      metadata = {},
      originalImage = null,
      status = 'ready',
    } = params;
    const shareToken = this.generateShareToken();
    const shareDir = getSafeShareDir(shareToken);

    if (!/^data:image\/\w+;base64,/.test(imageBase64)) {
      throw new Error(
        `createImageShare: imageBase64 must be a "data:image/...;base64,..." string (got ${imageBase64.slice(0, 32)}...)`
      );
    }

    try {
      await fs.mkdir(shareDir, { recursive: true });

      const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      const imageBuffer = Buffer.from(base64Data, 'base64');

      const isPng =
        imageBuffer.length >= 8 &&
        imageBuffer[0] === 0x89 &&
        imageBuffer[1] === 0x50 &&
        imageBuffer[2] === 0x4e &&
        imageBuffer[3] === 0x47;
      const isJpeg =
        imageBuffer.length >= 3 &&
        imageBuffer[0] === 0xff &&
        imageBuffer[1] === 0xd8 &&
        imageBuffer[2] === 0xff;
      if (!isPng && !isJpeg) {
        throw new Error(
          `createImageShare: decoded payload is not a valid PNG or JPEG (decoded size: ${imageBuffer.length} bytes)`
        );
      }

      const mimeType = isJpeg ? 'image/jpeg' : 'image/png';
      const extension = isJpeg ? 'jpg' : 'png';

      const targetImagePath = path.join(shareDir, `media.${extension}`);
      await fs.writeFile(targetImagePath, imageBuffer);

      let originalImageFilename: string | null = null;
      if (originalImage) {
        const origBase64Data = originalImage.replace(/^data:image\/\w+;base64,/, '');
        const origBuffer = Buffer.from(origBase64Data, 'base64');
        const origMimeType = originalImage.startsWith('data:image/jpeg')
          ? 'image/jpeg'
          : 'image/png';
        const origExtension = origMimeType === 'image/jpeg' ? 'jpg' : 'png';
        originalImageFilename = `original.${origExtension}`;
        const targetOriginalPath = path.join(shareDir, originalImageFilename);
        await fs.writeFile(targetOriginalPath, origBuffer);
      }

      // Intrinsic dimensions are cheap to read; the heavy thumbnail/variant +
      // BlurHash work runs in the background (see processMediaVariants) so the
      // share is created without blocking on AVIF encoding.
      let imageInfo: ImageInfo = { width: 0, height: 0 };
      try {
        const m = await sharp(targetImagePath, { failOn: 'none' }).metadata();
        imageInfo = { width: m.width ?? 0, height: m.height ?? 0 };
      } catch (metaError) {
        console.warn('[SharedMediaService] Could not read image dimensions:', metaError);
      }

      const relativeImagePath = `${shareToken}/media.${extension}`;

      const enrichedMetadata: EnrichedImageMetadata = {
        ...metadata,
        width: imageInfo.width,
        height: imageInfo.height,
        hasOriginalImage: !!originalImage,
        originalImageFilename: originalImageFilename,
        generatedAt: new Date().toISOString(),
      };

      const query = `
                INSERT INTO shared_media
                (user_id, share_token, media_type, title, file_path, file_name, thumbnail_path,
                 file_size, mime_type, image_type, image_metadata, status)
                VALUES ($1, $2, 'image', $3, $4, $5, $6, $7, $8, $9, $10, $11)
                RETURNING id, share_token, created_at
            `;

      const result = await this.postgres!.queryOne<{
        id: string;
        share_token: string;
        created_at: Date;
      }>(query, [
        userId,
        shareToken,
        title || 'Geteiltes Bild',
        relativeImagePath,
        `media.${extension}`,
        null, // thumbnail_path filled by processMediaVariants
        imageBuffer.length,
        mimeType,
        imageType || null,
        JSON.stringify(enrichedMetadata),
        status,
      ]);

      // Fire-and-forget: responsive variants + BlurHash, then merge into the row.
      void this.processMediaVariants(shareToken, targetImagePath);

      console.log(
        `[SharedMediaService] Created image share ${shareToken} for user ${userId}${originalImage ? ' (with original)' : ''}`
      );

      return {
        id: result!.id,
        shareToken: result!.share_token,
        shareUrl: `/share/${shareToken}`,
        createdAt: result!.created_at,
        mediaType: 'image',
        hasOriginalImage: !!originalImage,
      };
    } catch (error) {
      try {
        await fs.rm(shareDir, { recursive: true, force: true });
      } catch {
        /* ignore cleanup errors */
      }
      console.error('[SharedMediaService] Failed to create image share:', error);
      throw new Error(`Failed to create image share: ${(error as Error).message}`);
    }
  }

  async createPendingVideoShare(
    userId: string,
    params: CreatePendingVideoShareParams
  ): Promise<ShareResult> {
    await this.ensureInitialized();
    await this.enforceUserLimit(userId);

    const { title, thumbnailPath, duration, projectId } = params;
    const shareToken = this.generateShareToken();
    const shareDir = getSafeShareDir(shareToken);

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

      const result = await this.postgres!.queryOne<{
        id: string;
        share_token: string;
        created_at: Date;
      }>(query, [
        userId,
        shareToken,
        title || 'Geteiltes Video',
        relativeThumbnailPath,
        duration || null,
        projectId || null,
      ]);

      console.log(
        `[SharedMediaService] Created pending video share ${shareToken} for user ${userId}`
      );

      return {
        id: result!.id,
        shareToken: result!.share_token,
        shareUrl: `/share/${shareToken}`,
        createdAt: result!.created_at,
        mediaType: 'video',
        status: 'processing',
      };
    } catch (error) {
      try {
        await fs.rm(shareDir, { recursive: true, force: true });
      } catch {
        /* ignore cleanup errors */
      }
      console.error('[SharedMediaService] Failed to create pending video share:', error);
      throw new Error(`Failed to create pending video share: ${(error as Error).message}`);
    }
  }

  async finalizeVideoShare(shareToken: string, videoPath: string): Promise<void> {
    await this.ensureInitialized();

    try {
      const shareDir = getSafeShareDir(shareToken);
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
                       sm.wolke_share_link_id, sm.wolke_file_path,
                       sm.expires_at, sm.password_hash, sm.transfer_files, sm.transfer_message,
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

  async getUserShares(
    userId: string,
    mediaType: 'image' | 'video' | null = null,
    status: string | readonly string[] | null = null,
    limit: number = 100
  ): Promise<SharedMediaRow[]> {
    await this.ensureInitialized();

    try {
      let query = `
                SELECT id, share_token, media_type, title, thumbnail_path, file_size,
                       duration, image_type, image_metadata, status, download_count, created_at
                FROM shared_media
                WHERE user_id = $1
                  AND (upload_source IS NULL OR upload_source != ALL($2))
            `;
      const params: unknown[] = [userId, [...NON_LIBRARY_UPLOAD_SOURCES]];
      let paramIndex = 3;

      if (mediaType) {
        query += ` AND media_type = $${paramIndex}`;
        params.push(mediaType);
        paramIndex++;
      }

      if (Array.isArray(status)) {
        query += ` AND status = ANY($${paramIndex})`;
        params.push(status);
        paramIndex++;
      } else if (status) {
        query += ` AND status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
      }

      query += ` ORDER BY created_at DESC LIMIT $${paramIndex}`;
      params.push(Math.min(Math.max(1, Math.trunc(limit)), 100));

      const results = await this.postgres!.query<SharedMediaRow>(query, params);
      return results;
    } catch (error) {
      console.error('[SharedMediaService] Failed to get user shares:', error);
      throw new Error(`Failed to get user shares: ${(error as Error).message}`);
    }
  }

  async recordDownload(
    shareToken: string,
    email: string | null,
    ipAddress: string,
    shareId?: string
  ): Promise<boolean> {
    await this.ensureInitialized();

    try {
      let id = shareId;
      if (!id) {
        const share = await this.getShareByToken(shareToken);
        if (!share) {
          throw new Error('Share not found');
        }
        id = share.id;
      }

      const insertQuery = `
                INSERT INTO shared_media_downloads (shared_media_id, downloader_email, ip_address)
                VALUES ($1, $2, $3)
            `;
      await this.postgres!.query(insertQuery, [id, email, ipAddress]);

      const updateQuery = `
                UPDATE shared_media
                SET download_count = download_count + 1
                WHERE id = $1
            `;
      await this.postgres!.query(updateQuery, [id]);

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
      const share = await this.postgres!.queryOne<{
        id: string;
        file_path: string;
        thumbnail_path: string;
      }>(query, [shareToken, userId]);

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

  /** Rename a share (title only), owner-scoped. No file work — unlike the
   * PUT /image path this doesn't re-render, so a sharepic can be retitled
   * cheaply. Throws when the share isn't found or isn't owned by the user. */
  async renameShare(userId: string, shareToken: string, title: string): Promise<boolean> {
    await this.ensureInitialized();
    const rows = await this.postgres!.query(
      'UPDATE shared_media SET title = $1 WHERE share_token = $2 AND user_id = $3 RETURNING id',
      [title, shareToken, userId]
    );
    if (!rows || (rows as unknown[]).length === 0) {
      throw new Error('Share not found or not owned by user');
    }
    return true;
  }

  getMediaFilePath(relativePath: string | null): string | null {
    if (!relativePath) return null;
    const safePath = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '');
    const fullPath = path.join(SHARED_MEDIA_PATH, safePath);
    const resolvedPath = path.resolve(fullPath);
    if (!resolvedPath.startsWith(SHARED_MEDIA_PATH_RESOLVED + path.sep)) {
      return null;
    }
    return fullPath;
  }

  getThumbnailFilePath(relativePath: string | null): string | null {
    if (!relativePath) return null;
    const safePath = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '');
    const fullPath = path.join(SHARED_MEDIA_PATH, safePath);
    const resolvedPath = path.resolve(fullPath);
    if (!resolvedPath.startsWith(SHARED_MEDIA_PATH_RESOLVED + path.sep)) {
      return null;
    }
    return fullPath;
  }

  getOriginalImagePath(shareToken: string, filename: string): string | null {
    if (!shareToken || !filename) return null;
    const safeToken = path.basename(shareToken);
    const safeFilename = path.basename(filename);
    const fullPath = path.join(SHARED_MEDIA_PATH, safeToken, safeFilename);
    const resolvedPath = path.resolve(fullPath);
    if (!resolvedPath.startsWith(SHARED_MEDIA_PATH_RESOLVED + path.sep)) {
      return null;
    }
    return fullPath;
  }

  // Clears stale `hasOriginalImage` / `originalImageFilename` flags when the
  // backing file is gone. Prevents the gallery from repeatedly trying to load
  // an original that no longer exists. Safe to call when the keys aren't set.
  async clearOriginalImageMetadata(shareToken: string): Promise<void> {
    await this.ensureInitialized();
    const query = `
      UPDATE shared_media
      SET image_metadata = (
        COALESCE(image_metadata, '{}'::jsonb)
        - 'originalImageFilename'
      ) || '{"hasOriginalImage": false}'::jsonb
      WHERE share_token = $1
    `;
    await this.postgres!.query(query, [shareToken]);
  }

  async getMediaLibrary(
    userId: string,
    filters: Partial<MediaLibraryFiltersInternal> = {}
  ): Promise<MediaLibraryResult> {
    await this.ensureInitialized();

    const { type = 'all', search = null, limit = 50, offset = 0, sort = 'newest' } = filters;

    try {
      // Intentionally narrower than USER_VISIBLE_SHARE_STATUSES: the media
      // library is a curated asset pool, drafts stay out until published.
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
        params.push(likeContainsPattern(search));
        paramIndex++;
      }

      query += sort === 'oldest' ? ` ORDER BY created_at ASC` : ` ORDER BY created_at DESC`;

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
        offset,
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

  async updateMediaMetadata(
    userId: string,
    mediaId: string,
    params: UpdateMediaMetadataParams
  ): Promise<MetadataUpdateResult> {
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

    const {
      fileBuffer,
      originalFilename,
      mimeType,
      title,
      altText,
      uploadSource = 'upload',
    } = params;
    const shareToken = this.generateShareToken();
    const shareDir = getSafeShareDir(shareToken);

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
      let imageInfo: ImageInfo | null = null;

      if (isImage) {
        // Cheap dimension read; thumbnail/variants/BlurHash run in the background.
        try {
          const m = await sharp(targetPath, { failOn: 'none' }).metadata();
          imageInfo = { width: m.width ?? 0, height: m.height ?? 0 };
        } catch (metaError) {
          console.warn('[SharedMediaService] Could not read upload dimensions:', metaError);
        }
      }

      // Non-library sources (gallery thumbnails, canvas-element tool output) are
      // internal artifacts — keep them out of the Mediathek (getMediaLibrary
      // filters on is_library_item).
      const isLibraryItem = !(NON_LIBRARY_UPLOAD_SOURCES as readonly string[]).includes(
        uploadSource
      );

      const query = `
                INSERT INTO shared_media
                (user_id, share_token, media_type, title, file_path, file_name, thumbnail_path,
                 file_size, mime_type, status, is_library_item, alt_text, upload_source, original_filename,
                 image_metadata)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ready', $10, $11, $12, $13, $14)
                RETURNING id, share_token, created_at
            `;

      const result = await this.postgres!.queryOne<{
        id: string;
        share_token: string;
        created_at: Date;
      }>(query, [
        userId,
        shareToken,
        isImage ? 'image' : 'video',
        title || originalFilename || 'Uploaded media',
        relativeFilePath,
        `media.${extension}`,
        null, // thumbnail_path filled by processMediaVariants
        fileBuffer.length,
        mimeType,
        isLibraryItem,
        altText || null,
        uploadSource,
        originalFilename,
        imageInfo ? JSON.stringify(imageInfo) : null,
      ]);

      if (isImage) {
        void this.processMediaVariants(shareToken, targetPath);
      }

      console.log(`[SharedMediaService] Uploaded media ${shareToken} for user ${userId}`);

      return {
        id: result!.id,
        shareToken: result!.share_token,
        shareUrl: `/share/${shareToken}`,
        createdAt: result!.created_at,
        mediaType: isImage ? 'image' : 'video',
      };
    } catch (error) {
      try {
        await fs.rm(shareDir, { recursive: true, force: true });
      } catch {
        /* ignore cleanup errors */
      }
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
      'video/quicktime': 'mov',
    };
    return mimeToExt[mimeType] || 'bin';
  }

  async updateImageShare(
    userId: string,
    shareToken: string,
    params: UpdateImageShareParams
  ): Promise<ShareResult> {
    await this.ensureInitialized();

    const { imageBase64, title, metadata = {}, originalImage = null } = params;

    try {
      const existingShare = await this.postgres!.queryOne<{
        id: string;
        file_path: string;
        image_metadata: Record<string, unknown> | null;
      }>(
        'SELECT id, file_path, image_metadata FROM shared_media WHERE share_token = $1 AND user_id = $2',
        [shareToken, userId]
      );

      if (!existingShare) {
        throw new Error('Share not found or not owned by user');
      }

      const shareDir = getSafeShareDir(shareToken);
      await fs.mkdir(shareDir, { recursive: true });

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
        const origMimeType = originalImage.startsWith('data:image/jpeg')
          ? 'image/jpeg'
          : 'image/png';
        const origExtension = origMimeType === 'image/jpeg' ? 'jpg' : 'png';
        originalImageFilename = `original.${origExtension}`;
        const targetOriginalPath = path.join(shareDir, originalImageFilename);
        await fs.writeFile(targetOriginalPath, origBuffer);
      } else {
        originalImageFilename =
          ((existingMetadata as Record<string, unknown>).originalImageFilename as string | null) ||
          null;
      }

      let imageInfo: ImageInfo = { width: 0, height: 0 };
      try {
        const m = await sharp(targetImagePath, { failOn: 'none' }).metadata();
        imageInfo = { width: m.width ?? 0, height: m.height ?? 0 };
      } catch (metaError) {
        console.warn('[SharedMediaService] Could not read updated image dimensions:', metaError);
      }

      // The image changed: drop stale cached variants so the background pass and
      // the `/preview` on-demand path don't serve the previous image.
      await fs.rm(path.join(shareDir, 'thumbs'), { recursive: true, force: true });

      const enrichedMetadata: EnrichedImageMetadata = {
        ...metadata,
        width: imageInfo.width,
        height: imageInfo.height,
        hasOriginalImage: !!originalImageFilename,
        originalImageFilename: originalImageFilename,
        updatedAt: new Date().toISOString(),
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
        existingShare.id,
      ]);

      void this.processMediaVariants(shareToken, targetImagePath);

      console.log(`[SharedMediaService] Updated image share ${shareToken}`);

      return {
        id: existingShare.id,
        shareToken: shareToken,
        shareUrl: `/share/${shareToken}`,
        createdAt: new Date(),
        mediaType: 'image',
        hasOriginalImage: !!originalImageFilename,
      };
    } catch (error) {
      console.error('[SharedMediaService] Failed to update image share:', error);
      throw new Error(`Failed to update image share: ${(error as Error).message}`);
    }
  }

  /**
   * Mark existing shared media as a template
   */
  async markAsTemplate(
    userId: string,
    shareToken: string,
    title: string,
    visibility: 'private' | 'unlisted' | 'public',
    creatorName: string
  ): Promise<void> {
    await this.ensureInitialized();

    try {
      // Verify ownership
      const checkQuery = `SELECT user_id FROM shared_media WHERE share_token = $1`;
      const existing = await this.postgres!.queryOne<{ user_id: string }>(checkQuery, [shareToken]);

      if (!existing) {
        throw new Error('Share not found');
      }

      if (existing.user_id !== userId) {
        throw new Error('Not authorized to mark this as template');
      }

      // Mark as template
      const updateQuery = `
                UPDATE shared_media
                SET is_template = TRUE,
                    template_visibility = $1,
                    template_creator_name = $2,
                    title = $3
                WHERE share_token = $4
            `;

      await this.postgres!.query(updateQuery, [visibility, creatorName, title, shareToken]);

      console.log(
        `[SharedMediaService] Marked ${shareToken} as template with visibility: ${visibility}`
      );
    } catch (error) {
      console.error('[SharedMediaService] Failed to mark as template:', error);
      throw error;
    }
  }

  /**
   * Clone a template to user's gallery
   */
  async cloneTemplate(
    shareToken: string,
    userId: string,
    _userDisplayName: string
  ): Promise<ShareResult> {
    await this.ensureInitialized();
    await this.enforceUserLimit(userId);

    try {
      // 1. Fetch template
      const templateQuery = `
                SELECT id, user_id, media_type, image_type, image_metadata, template_visibility, template_creator_name
                FROM shared_media
                WHERE share_token = $1 AND is_template = TRUE
            `;
      const template = await this.postgres!.queryOne<{
        id: string;
        user_id: string;
        media_type: string;
        image_type: string | null;
        image_metadata: Record<string, unknown>;
        template_visibility: string;
        template_creator_name: string | null;
      }>(templateQuery, [shareToken]);

      if (!template) {
        throw new Error('Template not found');
      }

      // 2. Check visibility permissions
      if (template.template_visibility === 'private' && template.user_id !== userId) {
        throw new Error('Template not accessible (private)');
      }

      // 3. Deep copy metadata (all canvas state)
      const clonedMetadata: Record<string, unknown> = template.image_metadata
        ? (JSON.parse(JSON.stringify(template.image_metadata)) as Record<string, unknown>)
        : {};

      // 4. Create new share entry
      const newShareToken = this.generateShareToken();
      const insertQuery = `
                INSERT INTO shared_media
                (user_id, share_token, media_type, image_type, image_metadata, is_template, original_template_id, status)
                VALUES ($1, $2, $3, $4, $5, FALSE, $6, 'processing')
                RETURNING id, share_token, created_at
            `;

      const result = await this.postgres!.queryOne<{
        id: string;
        share_token: string;
        created_at: Date;
      }>(insertQuery, [
        userId,
        newShareToken,
        template.media_type,
        template.image_type,
        JSON.stringify(clonedMetadata),
        template.id,
      ]);

      // 5. Increment template use count
      const incrementQuery = `
                UPDATE shared_media
                SET template_use_count = template_use_count + 1
                WHERE share_token = $1
            `;
      await this.postgres!.query(incrementQuery, [shareToken]);

      console.log(
        `[SharedMediaService] Cloned template ${shareToken} to ${newShareToken} for user ${userId}`
      );

      return {
        id: result!.id,
        shareToken: result!.share_token,
        shareUrl: `/share/${result!.share_token}`,
        createdAt: result!.created_at,
        mediaType: template.media_type as 'image' | 'video',
      };
    } catch (error) {
      console.error('[SharedMediaService] Failed to clone template:', error);
      throw error;
    }
  }

  /**
   * Get templates (user's + public)
   */
  async getTemplates(
    userId: string,
    filters?: { type?: string; visibility?: string }
  ): Promise<SharedMediaRow[]> {
    await this.ensureInitialized();

    try {
      let query = `
                SELECT
                    id, user_id, share_token, media_type, title, image_type, image_metadata,
                    thumbnail_path, template_visibility, template_creator_name, template_use_count,
                    created_at
                FROM shared_media
                WHERE is_template = TRUE
                    AND (user_id = $1 OR template_visibility = 'public')
            `;

      const params: unknown[] = [userId];
      let paramIndex = 2;

      if (filters?.type) {
        query += ` AND image_type = $${paramIndex}`;
        params.push(filters.type);
        paramIndex++;
      }

      if (filters?.visibility && filters.visibility !== 'all') {
        query += ` AND template_visibility = $${paramIndex}`;
        params.push(filters.visibility);
        paramIndex++;
      }

      query += ` ORDER BY created_at DESC`;

      const templates = await this.postgres!.query<SharedMediaRow>(query, params);

      console.log(
        `[SharedMediaService] Retrieved ${templates.length} templates for user ${userId}`
      );
      return templates;
    } catch (error) {
      console.error('[SharedMediaService] Failed to get templates:', error);
      throw new Error('Failed to retrieve templates');
    }
  }

  /**
   * Get template by shareToken
   */
  async getTemplateByToken(shareToken: string, requestingUserId?: string): Promise<SharedMediaRow> {
    await this.ensureInitialized();

    try {
      const query = `
                SELECT
                    id, user_id, share_token, media_type, title, image_type, image_metadata,
                    thumbnail_path, template_visibility, template_creator_name, template_use_count,
                    created_at
                FROM shared_media
                WHERE share_token = $1 AND is_template = TRUE
            `;

      const template = await this.postgres!.queryOne<SharedMediaRow>(query, [shareToken]);

      if (!template) {
        throw new Error('Template not found');
      }

      // Check access permissions
      const visibility = template.template_visibility as string;
      if (visibility === 'private' && template.user_id !== requestingUserId) {
        throw new Error('Template not accessible (private)');
      }

      return template;
    } catch (error) {
      console.error('[SharedMediaService] Failed to get template by token:', error);
      throw error;
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
