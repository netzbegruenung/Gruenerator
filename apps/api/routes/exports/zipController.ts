/**
 * ZIP Export Controller
 * Creates ZIP archives from multiple images (PNG base64 data URLs)
 */

import archiver from 'archiver';
import express, { type Request, type Response } from 'express';

import { createLogger } from '../../utils/logger.js';

const log = createLogger('exportZip');

const router = express.Router();

interface ZipExportRequestBody {
  images: string[];
  canvasType?: string;
}

interface ZipExportErrorResponse {
  success: false;
  message: string;
  error?: string;
}

/**
 * POST /api/exports/zip
 * Generate ZIP archive containing PNG images from base64 data URLs
 */
router.post(
  '/',
  async (
    req: Request<object, Buffer | ZipExportErrorResponse, ZipExportRequestBody>,
    res: Response
  ) => {
    try {
      const { images, canvasType = 'canvas' } = req.body || {};

      if (!images || !Array.isArray(images) || images.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Keine Bilder zum Exportieren',
        });
      }

      // Validate that all entries are valid base64 data URLs
      for (let i = 0; i < images.length; i++) {
        if (!images[i].startsWith('data:image/')) {
          return res.status(400).json({
            success: false,
            message: `Ungültiges Bildformat bei Seite ${i + 1}`,
          });
        }
      }

      log.info(
        `[exportZip] Creating ZIP with ${images.length} images for canvas type: ${canvasType}`
      );

      // Set response headers for ZIP download
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const filename = `gruenerator-${canvasType}-${timestamp}.zip`;

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      // Create archiver instance
      const archive = archiver('zip', {
        zlib: { level: 6 }, // Balanced compression
      });

      // Pipe archive data to response
      archive.pipe(res);

      // Handle archive errors
      archive.on('error', (err) => {
        log.error('[exportZip] Archive error:', err);
        throw err;
      });

      // Add each image to the archive
      for (let i = 0; i < images.length; i++) {
        const dataUrl = images[i];

        // Extract base64 data from data URL
        const matches = dataUrl.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/);
        if (!matches) {
          log.warn(`[exportZip] Invalid data URL format for image ${i + 1}`);
          continue;
        }

        const [, format, base64Data] = matches;
        const buffer = Buffer.from(base64Data, 'base64');
        const extension = format === 'jpeg' || format === 'jpg' ? 'jpg' : 'png';
        const imageFilename = `seite-${i + 1}.${extension}`;

        archive.append(buffer, { name: imageFilename });
      }

      // Finalize the archive
      await archive.finalize();

      log.info(`[exportZip] ZIP created successfully with ${images.length} images`);
    } catch (err) {
      const error = err as Error;
      log.error('[exportZip] ZIP export error:', error);

      // Only send error response if headers haven't been sent yet
      if (!res.headersSent) {
        return res.status(500).json({
          success: false,
          message: 'ZIP-Export fehlgeschlagen',
          error: error.message,
        });
      }
    }
  }
);

export default router;
