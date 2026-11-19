import fs from 'fs';
import { dirname, join, basename } from 'path';
import { fileURLToPath } from 'url';

import { type RequestHandler } from 'express';

import { getThumbnailVariant, openVariant } from '../../services/media/thumbnailCache.js';
import { isThumbnailFormat, isThumbnailWidth } from '../../services/media/thumbnailUrl.js';
import { liveStockPhoto } from '../../services/sharepicCreator/catalog.js';
import { createLogger } from '../../utils/logger.js';

import type { StockImageQuery } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const log = createLogger('imagePicker');

const STOCK_DIR = join(__dirname, '../../public/sharepic_example_bg');
// The URLs carry no content version, so not `immutable`: a replaced file
// reaches clients within a week, and SWR hides the revalidation.
const STOCK_CACHE_CONTROL = 'public, max-age=604800, stale-while-revalidate=86400';
// Unsplash may retire a photo; a day keeps the redirect from outliving it long.
const LIVE_STOCK_CACHE_CONTROL = 'public, max-age=86400';

/**
 * GET /stock-image/:filename
 * Serves a stock image file.
 * Query params:
 *   ?size=thumb       400px JPEG thumbnail (picker grid)
 *   ?w=<width>&fmt=   resized variant from the thumbnail cache — the canvas asks
 *                     for 2160 (`shareCanvasPreviewUrl`). The originals are
 *                     Unsplash downloads of up to 5792x8688 and 7.5 MB, for a
 *                     1080px scene.
 * A `w` outside `THUMBNAIL_WIDTHS` serves the original rather than an error:
 * a wrong size is a slower image, a 400 is a missing one.
 * A photo the sharepic creator found live on Unsplash is not on disk and may
 * not be re-hosted (API Terms): it redirects to Unsplash's image host, whose
 * `w` parameter does the resizing.
 */
export const stockImageHandler =
  ({ allowLive }: { allowLive: boolean }): RequestHandler =>
  async (req, res) => {
    const { filename } = req.params as { filename: string };
    const { size, w, fmt } = req.query as StockImageQuery;
    const sanitizedFilename = basename(filename);

    if (!(await fs.promises.stat(join(STOCK_DIR, sanitizedFilename)).catch(() => null))) {
      const live = allowLive ? await liveStockPhoto(sanitizedFilename) : null;
      if (!live) {
        res.status(404).json({ error: 'Image not found' });
        return;
      }
      const target = new URL(size === 'thumb' ? live.thumb_url : live.url);
      if (size !== 'thumb' && isThumbnailWidth(Number(w))) target.searchParams.set('w', String(w));
      res.set('Cache-Control', LIVE_STOCK_CACHE_CONTROL);
      res.redirect(302, target.href);
      return;
    }

    const sendStockFile = (imagePath: string) => {
      res.set('Cache-Control', STOCK_CACHE_CONTROL);
      res.sendFile(imagePath, (err) => {
        if (err) {
          log.error('[ImagePicker API] Stock image serve error:', err);
          res.status(404).json({ error: 'Image not found' });
        }
      });
    };

    if (size === 'thumb') {
      const thumbName = sanitizedFilename.replace(/\.\w+$/, '.jpg');
      sendStockFile(join(STOCK_DIR, 'thumbs', thumbName));
      return;
    }

    const imagePath = join(STOCK_DIR, sanitizedFilename);
    const width = Number(w);
    if (!isThumbnailWidth(width)) {
      sendStockFile(imagePath);
      return;
    }

    try {
      const stat = await fs.promises.stat(imagePath).catch(() => null);
      if (!stat) {
        res.status(404).json({ error: 'Image not found' });
        return;
      }
      const variant = await getThumbnailVariant(
        {
          kind: 'stock',
          id: sanitizedFilename,
          // Size, not mtime: every deploy rewrites the mtime of files baked
          // into the image, and would re-render the whole set each time.
          v: `s${stat.size}`,
          width,
          fmt: typeof fmt === 'string' && isThumbnailFormat(fmt) ? fmt : 'webp',
        },
        { sourcePath: imagePath, contentType: 'image/jpeg' }
      );
      if (!variant) {
        res.status(404).json({ error: 'Image not found' });
        return;
      }

      res.setHeader('Content-Type', variant.contentType);
      res.setHeader('Content-Length', variant.size);
      res.setHeader('Cache-Control', STOCK_CACHE_CONTROL);
      if (variant.buffer) {
        res.send(variant.buffer);
        return;
      }
      openVariant(variant.filePath as string).pipe(res);
    } catch (error) {
      log.error('[ImagePicker API] Stock image resize error:', error);
      res.status(500).json({ error: 'Failed to load image' });
    }
  };
