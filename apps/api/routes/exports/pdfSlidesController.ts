/**
 * PDF Slides Export Controller
 * Assembles multiple slide images (PNG base64) into a landscape 16:9 PDF.
 * Uses pdf-lib (already installed) — no extra dependencies needed.
 */

import express, { type Request, type Response } from 'express';
import { PDFDocument } from 'pdf-lib';

import { setContentDisposition } from '../../utils/http/contentDisposition.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('exportPdfSlides');

const router = express.Router();

router.use(express.json({ limit: '100mb' }));

interface PdfSlidesRequestBody {
  images: string[];
  title?: string;
}

interface PdfSlidesErrorResponse {
  success: false;
  message: string;
  error?: string;
}

/**
 * POST /api/exports/pdf-slides
 * Generate a landscape PDF from base64 PNG slide images.
 * Each image becomes one page at 16:9 aspect ratio (1920x1080 source).
 */
router.post(
  '/',
  async (
    req: Request<object, Buffer | PdfSlidesErrorResponse, PdfSlidesRequestBody>,
    res: Response
  ) => {
    try {
      const { images, title = 'Präsentation' } = req.body || {};

      if (!images || !Array.isArray(images) || images.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Keine Bilder zum Exportieren',
        });
      }

      log.info(`[exportPdfSlides] Creating PDF with ${images.length} slides`);

      const pdfDoc = await PDFDocument.create();

      // 16:9 landscape in PDF points (1 point = 1/72 inch)
      // Standard widescreen: 13.333 x 7.5 inches = 960 x 540 points
      const pageWidth = 960;
      const pageHeight = 540;

      for (let i = 0; i < images.length; i++) {
        const dataUrl = images[i];

        const matches = dataUrl.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/);
        if (!matches) {
          log.warn(`[exportPdfSlides] Invalid data URL for slide ${i + 1}, skipping`);
          continue;
        }

        const [, format, base64Data] = matches;
        const imageBytes = Buffer.from(base64Data, 'base64');

        const image =
          format === 'png' ? await pdfDoc.embedPng(imageBytes) : await pdfDoc.embedJpg(imageBytes);

        const page = pdfDoc.addPage([pageWidth, pageHeight]);

        // Scale image to fill the page while maintaining aspect ratio
        const imgAspect = image.width / image.height;
        const pageAspect = pageWidth / pageHeight;

        let drawWidth = pageWidth;
        let drawHeight = pageHeight;
        let drawX = 0;
        let drawY = 0;

        if (imgAspect > pageAspect) {
          drawHeight = pageWidth / imgAspect;
          drawY = (pageHeight - drawHeight) / 2;
        } else {
          drawWidth = pageHeight * imgAspect;
          drawX = (pageWidth - drawWidth) / 2;
        }

        page.drawImage(image, {
          x: drawX,
          y: drawY,
          width: drawWidth,
          height: drawHeight,
        });
      }

      const pdfBytes = await pdfDoc.save();

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const filename = `${title.replace(/[^a-zA-Z0-9äöüÄÖÜß\s-]/g, '').trim() || 'Praesentation'}-${timestamp}.pdf`;

      res.setHeader('Content-Type', 'application/pdf');
      setContentDisposition(res, filename);
      res.send(Buffer.from(pdfBytes));

      log.info(`[exportPdfSlides] PDF created with ${images.length} pages`);
    } catch (err) {
      const error = err as Error;
      log.error('[exportPdfSlides] PDF slides export error:', error);

      if (!res.headersSent) {
        return res.status(500).json({
          success: false,
          message: 'PDF-Export fehlgeschlagen',
          error: error.message,
        });
      }
    }
  }
);

export default router;
