/**
 * Legacy Express router for /api/share public + file-streaming endpoints.
 *
 * These routes stay on raw Express (not ts-rest): they serve binary streams
 * with range support, do dynamic thumbnail generation, and the download route
 * uses a two-stage handler (public transfer path → requireAuth fallthrough for
 * image/video) that ts-rest can't model.
 *
 *   GET /:shareToken            — public share info (rate-limited)
 *   GET /:shareToken/thumbnail  — thumbnail file
 *   GET /:shareToken/original   — original image (owner only)
 *   GET /:shareToken/preview    — smart preview (image/video, range, ?w= resize)
 *   GET /:shareToken/download   — transfer (public, password) or image/video (auth)
 *
 * Auth-guarded read/management routes live in shareReadContractRouter.ts and
 * the write routes in shareContractRouter.ts.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import express, { type Request, type Response, type Router } from 'express';
import sharp from 'sharp';

import { requireAuth } from '../../middleware/authMiddleware.js';
import { transferService } from '../../services/transferService.js';
import { setContentDisposition } from '../../utils/http/contentDisposition.js';
import { createLogger } from '../../utils/logger.js';

import { getSharedMediaService } from './shareServices.js';

import type { AuthenticatedRequest } from '../../middleware/types.js';
import type { SharedMediaRow } from '../../types/media.js';

const fsPromises = fs.promises;
const log = createLogger('share');

interface ShareTokenParams {
  shareToken: string;
  [key: string]: string;
}

/** Request extended with pre-fetched share data passed between middleware handlers */
interface RequestWithShare extends Request<ShareTokenParams> {
  _share?: SharedMediaRow;
}

interface ShareInfoResponse {
  success: boolean;
  share?: {
    mediaType: string;
    title: string | null;
    thumbnailUrl: string | null;
    downloadCount: number;
    viewCount: number;
    sharerName?: string;
    status: string;
    createdAt: Date;
    fileName?: string | null;
    fileSize?: number | null;
    mimeType?: string | null;
    isPasswordProtected?: boolean;
    expiresAt?: Date | null;
    transferMessage?: string | null;
    transferFiles?: Array<{ name: string; size: number; mimeType: string }> | null;
    duration?: number | null;
    imageType?: string | null;
    dimensions?: {
      width?: number | undefined;
      height?: number | undefined;
    };
  };
  error?: string;
}

const router: Router = express.Router();

// Public share info
router.get(
  '/:shareToken',
  async (req: Request<ShareTokenParams>, res: Response<ShareInfoResponse>) => {
    try {
      const { shareToken } = req.params;
      const service = await getSharedMediaService();
      const share = await service.getShareByToken(shareToken);

      if (!share) {
        return res.status(404).json({
          success: false,
          error: 'Geteiltes Medium nicht gefunden',
        });
      }

      await service.recordView(shareToken);

      const shareObj: NonNullable<ShareInfoResponse['share']> = {
        mediaType: share.media_type,
        title: share.title,
        thumbnailUrl: share.thumbnail_path ? `/api/share/${shareToken}/thumbnail` : null,
        downloadCount: share.download_count,
        viewCount: share.view_count,
        status: share.status || 'ready',
        createdAt: share.created_at,
        ...(share.sharer_name != null ? { sharerName: share.sharer_name } : {}),
      };
      const response: ShareInfoResponse = {
        success: true,
        share: shareObj,
      };

      if (share.media_type === 'transfer') {
        // Check expiry for transfers
        if (share.expires_at && new Date(share.expires_at) < new Date()) {
          return res.status(410).json({
            success: false,
            error: 'Dieser Transfer-Link ist abgelaufen.',
          });
        }

        response.share!.fileName = share.file_name;
        response.share!.fileSize = share.file_size;
        response.share!.mimeType = share.mime_type;
        response.share!.isPasswordProtected = !!share.password_hash;
        response.share!.expiresAt = share.expires_at ?? null;
        response.share!.transferMessage = share.transfer_message ?? null;

        const files = share.transfer_files;
        if (Array.isArray(files) && files.length > 0) {
          response.share!.transferFiles = files.map(
            (f: { name: string; size: number; mimeType: string }) => ({
              name: f.name,
              size: f.size,
              mimeType: f.mimeType,
            })
          );
        }
      } else if (share.media_type === 'video') {
        response.share!.duration = share.duration;
      } else {
        const metadata = (
          typeof share.image_metadata === 'string'
            ? JSON.parse(share.image_metadata)
            : share.image_metadata || {}
        ) as { width?: number; height?: number };
        response.share!.imageType = share.image_type;
        response.share!.dimensions = {
          width: metadata.width,
          height: metadata.height,
        };
      }

      return res.json(response);
    } catch (error) {
      log.error('Failed to get share info:', error);
      return res.status(500).json({
        success: false,
        error: 'Fehler beim Laden des geteilten Mediums',
      });
    }
  }
);

router.get('/:shareToken/thumbnail', async (req: Request<ShareTokenParams>, res: Response) => {
  try {
    const { shareToken } = req.params;
    const service = await getSharedMediaService();
    const share = await service.getShareByToken(shareToken);

    if (!share || !share.thumbnail_path) {
      return res.status(404).json({ error: 'Thumbnail nicht gefunden' });
    }

    const thumbnailPath = service.getThumbnailFilePath(share.thumbnail_path);

    try {
      await fsPromises.access(thumbnailPath);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      return res.sendFile(thumbnailPath);
    } catch {
      return res.status(404).json({ error: 'Thumbnail-Datei nicht gefunden' });
    }
  } catch (error) {
    log.error('Failed to get thumbnail:', error);
    return res.status(500).json({ error: 'Fehler beim Laden des Thumbnails' });
  }
});

router.get(
  '/:shareToken/original',
  requireAuth,
  async (req: Request<ShareTokenParams> & AuthenticatedRequest, res: Response) => {
    try {
      const { shareToken } = req.params;
      const userId = req.user!.id;

      const service = await getSharedMediaService();
      const share = await service.getShareByToken(shareToken);

      if (!share) {
        return res.status(404).json({ error: 'Share nicht gefunden' });
      }

      if (share.user_id !== userId) {
        return res.status(403).json({ error: 'Zugriff verweigert' });
      }

      const metadata = (share.image_metadata || {}) as Record<string, unknown>;
      if (!metadata.hasOriginalImage || !metadata.originalImageFilename) {
        return res.status(404).json({ error: 'Originalbild nicht vorhanden' });
      }

      const originalPath = service.getOriginalImagePath(
        shareToken,
        metadata.originalImageFilename as string
      );

      try {
        const stat = await fsPromises.stat(originalPath);
        const mimeType = (metadata.originalImageFilename as string).endsWith('.jpg')
          ? 'image/jpeg'
          : 'image/png';

        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Length', stat.size);
        res.setHeader('Cache-Control', 'private, max-age=3600');

        return fs.createReadStream(originalPath).pipe(res);
      } catch {
        // File is missing on disk but metadata claims it exists. Self-heal so
        // the gallery edit handler stops generating /original URLs for this share.
        try {
          await service.clearOriginalImageMetadata(shareToken);
        } catch (healError) {
          log.warn(
            'Failed to clear stale originalImage metadata for %s: %s',
            shareToken,
            healError
          );
        }
        return res.status(404).json({ error: 'Originalbild-Datei nicht gefunden' });
      }
    } catch (error) {
      log.error('Failed to get original image:', error);
      return res.status(500).json({ error: 'Fehler beim Laden des Originalbildes' });
    }
  }
);

router.get('/:shareToken/preview', async (req: Request<ShareTokenParams>, res: Response) => {
  try {
    const { shareToken } = req.params;
    const service = await getSharedMediaService();
    const share = await service.getShareByToken(shareToken);

    if (!share) {
      return res.status(404).json({ error: 'Medium nicht gefunden' });
    }

    if (share.status === 'processing') {
      return res.status(202).json({
        status: 'processing',
        message: 'Medium wird noch verarbeitet',
      });
    }

    if (share.status === 'failed') {
      return res.status(500).json({ error: 'Verarbeitung fehlgeschlagen' });
    }

    if (!share.file_path) {
      return res.status(404).json({ error: 'Datei nicht verfügbar' });
    }

    const mediaPath = service.getMediaFilePath(share.file_path);

    try {
      const stat = await fsPromises.stat(mediaPath);
      const fileSize = stat.size;

      if (share.media_type === 'video') {
        const range = req.headers.range;

        if (range) {
          const parts = range.replace(/bytes=/, '').split('-');
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
          const chunkSize = end - start + 1;

          res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunkSize,
            'Content-Type': 'video/mp4',
          });

          const stream = fs.createReadStream(mediaPath, { start, end });
          return stream.pipe(res);
        } else {
          res.writeHead(200, {
            'Content-Length': fileSize,
            'Content-Type': 'video/mp4',
          });
          return fs.createReadStream(mediaPath).pipe(res);
        }
      } else {
        // Responsive thumbnails via ?w=<width>&fmt=<webp|avif>. These files are
        // normally pre-generated at upload (sharedMediaService.generateMediaVariants);
        // when a variant is missing we generate + cache it on demand. Explicit
        // `fmt` (rather than Accept negotiation) keeps every URL independently
        // cacheable. Filenames must match the generator: `<base>_w<width>.<fmt>`.
        const requestedWidth = parseInt(req.query.w as string, 10);
        const fmt = req.query.fmt === 'avif' ? 'avif' : 'webp';
        if (requestedWidth && requestedWidth > 0 && requestedWidth < 2000) {
          try {
            const thumbDir = path.join(path.dirname(mediaPath), 'thumbs');
            const thumbFilename = `${path.basename(mediaPath, path.extname(mediaPath))}_w${requestedWidth}.${fmt}`;
            const thumbPath = path.join(thumbDir, thumbFilename);
            const contentType = fmt === 'avif' ? 'image/avif' : 'image/webp';

            // Serve the pre-generated/cached variant if present.
            try {
              const thumbStat = await fsPromises.stat(thumbPath);
              res.setHeader('Content-Type', contentType);
              res.setHeader('Content-Length', thumbStat.size);
              res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
              return fs.createReadStream(thumbPath).pipe(res);
            } catch {
              // Not generated yet — fall through to on-demand generation.
            }

            await fsPromises.mkdir(thumbDir, { recursive: true });
            const resized = sharp(mediaPath, { failOn: 'none' }).resize({
              width: requestedWidth,
              withoutEnlargement: true,
            });
            const thumbBuffer = await (
              fmt === 'avif' ? resized.avif({ quality: 60 }) : resized.webp({ quality: 78 })
            ).toBuffer();

            // Cache to disk asynchronously (don't await)
            fsPromises.writeFile(thumbPath, thumbBuffer).catch((err) => {
              log.error('Failed to cache thumbnail:', err);
            });

            res.setHeader('Content-Type', contentType);
            res.setHeader('Content-Length', thumbBuffer.length);
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            return res.send(thumbBuffer);
          } catch (resizeErr) {
            log.error('Thumbnail generation failed, serving original:', resizeErr);
            // Fall through to serve original
          }
        }

        res.setHeader('Content-Type', share.mime_type || 'image/png');
        res.setHeader('Content-Length', fileSize);
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return fs.createReadStream(mediaPath).pipe(res);
      }
    } catch {
      return res.status(404).json({ error: 'Datei nicht gefunden' });
    }
  } catch (error) {
    log.error('Failed to serve preview:', error);
    return res.status(500).json({ error: 'Fehler beim Laden der Vorschau' });
  }
});

/**
 * GET /:shareToken/download
 * Transfer downloads are public (no auth). Image/video downloads require auth.
 */
router.get(
  '/:shareToken/download',
  async (
    req: Request<ShareTokenParams>,
    res: Response,
    next: express.NextFunction
  ): Promise<void> => {
    try {
      const { shareToken } = req.params;
      const service = await getSharedMediaService();
      const share = await service.getShareByToken(shareToken as string);

      if (!share) {
        res.status(404).json({ success: false, error: 'Geteiltes Medium nicht gefunden' });
        return;
      }

      if (share.media_type === 'transfer') {
        if (share.expires_at && new Date(share.expires_at) < new Date()) {
          res.status(410).json({ success: false, error: 'Dieser Transfer-Link ist abgelaufen.' });
          return;
        }

        // scrypt format: "salt:hash"
        const password = req.headers['x-transfer-password'] as string;
        if (share.password_hash) {
          if (!password) {
            res.status(401).json({ success: false, error: 'Passwort erforderlich.' });
            return;
          }
          const [salt, storedHash] = share.password_hash.split(':');
          if (!salt || !storedHash) {
            res.status(500).json({ success: false, error: 'Ungültiger Passwort-Hash.' });
            return;
          }
          const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex');
          const passwordValid = crypto.timingSafeEqual(
            Buffer.from(derivedKey, 'hex'),
            Buffer.from(storedHash, 'hex')
          );
          if (!passwordValid) {
            res.status(403).json({ success: false, error: 'Falsches Passwort.' });
            return;
          }
        }

        const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
        await service.recordDownload(shareToken as string, null, ipAddress, share.id);

        try {
          const transferParams = {
            user_id: share.user_id,
            ...(share.wolke_share_link_id != null
              ? { wolke_share_link_id: share.wolke_share_link_id }
              : {}),
            ...(share.wolke_file_path != null ? { wolke_file_path: share.wolke_file_path } : {}),
            ...(share.file_name != null ? { file_name: share.file_name } : {}),
          };
          const result = await transferService.proxyDownloadWithRecord(transferParams);

          res.setHeader(
            'Content-Type',
            result.mimeType || share.mime_type || 'application/octet-stream'
          );
          res.setHeader('Content-Length', result.size);
          setContentDisposition(res, result.fileName);

          log.info(`Transfer download: ${(shareToken as string).substring(0, 8)} (public)`);
          res.send(result.buffer);
        } catch (proxyErr) {
          const err = proxyErr as Error;
          log.error('Transfer proxy download failed', { error: err.message });
          if (!res.headersSent) {
            res.status(502).json({ success: false, error: 'Download von Wolke fehlgeschlagen.' });
          }
        }
        return;
      }

      // Image/video downloads: require auth — pass share to avoid re-fetch
      (req as RequestWithShare)._share = share;
      next();
    } catch (error) {
      log.error('Failed to process download:', error);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'Fehler beim Download' });
      }
    }
  },
  requireAuth,
  async (req: Request<ShareTokenParams> & AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { shareToken } = req.params;
      const userId = req.user!.id;
      const userEmail = req.user!.email || 'authenticated-user';

      const service = await getSharedMediaService();
      const share =
        (req as RequestWithShare)._share ?? (await service.getShareByToken(shareToken as string));

      if (!share) {
        res.status(404).json({ success: false, error: 'Geteiltes Medium nicht gefunden' });
        return;
      }

      if (share.status === 'processing') {
        res.status(202).json({
          success: false,
          status: 'processing',
          error: 'Medium wird noch verarbeitet. Bitte warte einen Moment.',
        });
        return;
      }

      if (share.status === 'failed') {
        res.status(500).json({ success: false, error: 'Verarbeitung fehlgeschlagen' });
        return;
      }

      if (!share.file_path) {
        res.status(404).json({ success: false, error: 'Datei nicht verfügbar' });
        return;
      }

      const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
      await service.recordDownload(shareToken as string, userEmail, ipAddress);

      const mediaPath = service.getMediaFilePath(share.file_path);

      try {
        const stat = await fsPromises.stat(mediaPath);
        const fileSize = stat.size;

        const sanitizedTitle = (share.title || 'media')
          .replace(/[^a-zA-Z0-9_-]/g, '_')
          .substring(0, 50);

        const extension =
          share.media_type === 'video' ? 'mp4' : share.mime_type === 'image/jpeg' ? 'jpg' : 'png';
        const filename = `${sanitizedTitle}_gruenerator.${extension}`;

        res.setHeader(
          'Content-Type',
          share.mime_type || (share.media_type === 'video' ? 'video/mp4' : 'image/png')
        );
        res.setHeader('Content-Length', fileSize);
        setContentDisposition(res, filename);

        log.info(`Download started: ${shareToken} by user ${userId} (${userEmail})`);

        const fileStream = fs.createReadStream(mediaPath);
        fileStream.pipe(res);

        fileStream.on('error', (streamError): void => {
          log.error(`Stream error for ${shareToken}: ${streamError.message}`);
          if (!res.headersSent) {
            res.status(500).json({ error: 'Fehler beim Download' });
          }
        });

        return;
      } catch {
        res.status(404).json({ success: false, error: 'Datei nicht gefunden' });
        return;
      }
    } catch (error) {
      log.error('Failed to download share:', error);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'Fehler beim Download' });
      }
      return;
    }
  }
);

export default router;
