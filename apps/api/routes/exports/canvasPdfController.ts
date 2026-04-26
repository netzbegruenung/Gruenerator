/**
 * Canvas PDF Export Controller
 *
 * Wraps a single Konva-rendered PNG (uploaded as a base64 data URL) into a
 * properly-sized PDF page. For print formats (flyer-a4, flyer-a5, plakat-a3)
 * the page size is derived from the paper dimensions; digital formats produce
 * a PDF page sized to their pixel dimensions at 72 DPI.
 *
 * Cloned from pdfSlidesController; same pdf-lib pattern, format-aware page sizes.
 */

import express, { type Request, type Response } from 'express';
import { PDFDocument } from 'pdf-lib';

import { rateLimitMiddleware, incrementRateLimit } from '../../middleware/rateLimitMiddleware.js';
import { createLogger } from '../../utils/logger.js';

import { getServerFormat, paperSizeForFormat } from './pageConstants.js';
import { sanitizePdfFilename } from './pdfController.js';

const log = createLogger('exportCanvasPdf');

const router = express.Router();

// Match pdfSlidesController.ts:16 — a 300-DPI A3 PNG is ~92MB as base64.
router.use(express.json({ limit: '100mb' }));

interface CanvasPdfRequestBody {
  imageDataUrl: string;
  formatId: string;
  withBleed?: boolean;
  title?: string;
}

interface CanvasPdfErrorResponse {
  success: false;
  message: string;
  error?: string;
}

/**
 * POST /api/exports/canvas-pdf
 * Body: { imageDataUrl, formatId, withBleed?, title? }
 * Response: application/pdf (streamed)
 */
router.post('/', rateLimitMiddleware('pdf_export'), async (req: Request, res: Response) => {
  try {
    const body = (req.body || {}) as CanvasPdfRequestBody;
    const { imageDataUrl, formatId, withBleed = false, title = 'Canvas' } = body;

    if (!imageDataUrl || typeof imageDataUrl !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'imageDataUrl fehlt oder ist ungültig',
      });
    }

    const format = getServerFormat(formatId);
    if (!format) {
      return res.status(400).json({
        success: false,
        message: `Unbekanntes Format '${formatId}'`,
      });
    }

    const matches = imageDataUrl.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/);
    if (!matches) {
      return res.status(400).json({
        success: false,
        message: 'imageDataUrl muss eine PNG- oder JPEG-Data-URL sein',
      });
    }

    const [, imgFormat, base64Data] = matches;
    const imageBytes = Buffer.from(base64Data, 'base64');

    const pdfDoc = await PDFDocument.create();
    const image =
      imgFormat === 'png' ? await pdfDoc.embedPng(imageBytes) : await pdfDoc.embedJpg(imageBytes);

    const [pageWidth, pageHeight] = paperSizeForFormat(format, withBleed);
    const page = pdfDoc.addPage([pageWidth, pageHeight]);

    // Draw the image filling the entire page (with bleed extending past the
    // trim line for print-shop processing).
    page.drawImage(image, {
      x: 0,
      y: 0,
      width: pageWidth,
      height: pageHeight,
    });

    const pdfBytes = await pdfDoc.save();

    const safeTitle = sanitizePdfFilename(title || 'Canvas');
    const filename = `${formatId}-${safeTitle}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(Buffer.from(pdfBytes));

    await incrementRateLimit(req);

    log.info(
      `[canvasPdf] Generated PDF format=${formatId} bleed=${withBleed} bytes=${pdfBytes.length}`
    );
  } catch (err) {
    const error = err as Error;
    log.error('[canvasPdf] PDF export error:', error);

    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: 'PDF-Export fehlgeschlagen',
        error: error.message,
      });
    }
  }
});

export default router;
