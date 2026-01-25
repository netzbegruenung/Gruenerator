/**
 * PDF Export Controller
 * Handles PDF document generation with custom fonts
 */

import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createLogger } from '../../utils/logger.js';
import { sanitizeFilename as sanitizeFilenameCentral } from '../../utils/validation/index.js';
import { htmlToPlainText, parseSections } from './contentParser.js';
import type { ExportRequestBody, ExportResponse, ContentSection } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const log = createLogger('exportPdf');

const router = express.Router();

function sanitizeFilename(name: string, fallback = 'Dokument'): string {
  const sanitized = sanitizeFilenameCentral(name, fallback);
  return sanitized.slice(0, 80) || fallback;
}

/**
 * POST /api/exports/pdf
 * Generate PDF document from HTML content
 */
router.post(
  '/',
  async (req: Request<{}, Buffer | ExportResponse, ExportRequestBody>, res: Response) => {
    try {
      const { content, title } = req.body || {};
      const plain = htmlToPlainText(content);
      const sections = parseSections(plain);

      const { PDFDocument, rgb } = await import('pdf-lib');

      const pdfDoc = await PDFDocument.create();
      let page = pdfDoc.addPage([595.28, 841.89]); // A4
      const { width, height } = page.getSize();
      const margin = 40;
      let y = height - margin;

      // Embed custom fonts
      const fontsDir = path.join(__dirname, '..', '..', 'public', 'fonts');
      const grueneTypeBytes = await fs.readFile(path.join(fontsDir, 'GrueneTypeNeue-Regular.ttf'));
      const ptSansRegularBytes = await fs.readFile(path.join(fontsDir, 'PTSans-Regular.ttf'));

      const titleFont = await pdfDoc.embedFont(grueneTypeBytes);
      const bodyFont = await pdfDoc.embedFont(ptSansRegularBytes);

      // Title
      const docTitle = title || 'Dokument';
      const titleSize = 20;
      const titleWidth = titleFont.widthOfTextAtSize(docTitle, titleSize);
      page.drawText(docTitle, {
        x: (width - titleWidth) / 2,
        y,
        size: titleSize,
        font: titleFont,
        color: rgb(0.15, 0.15, 0.15),
      });
      y -= 40;

      const drawParagraph = (text: string, isList = false): void => {
        const fontSize = 11;
        const lineHeight = fontSize * 1.5;
        const maxWidth = width - margin * 2 - (isList ? 20 : 0);
        const x = margin + (isList ? 20 : 0);
        const words = text.split(' ');
        let line = '';

        for (const w of words) {
          const test = line ? `${line} ${w}` : w;
          const testWidth = bodyFont.widthOfTextAtSize(test, fontSize);

          if (testWidth <= maxWidth) {
            line = test;
          } else {
            if (y < margin + 50) {
              page = pdfDoc.addPage([595.28, 841.89]);
              y = height - margin;
            }
            page.drawText(line, {
              x,
              y,
              size: fontSize,
              font: bodyFont,
              color: rgb(0.27, 0.27, 0.27),
            });
            y -= lineHeight;
            line = w;
          }
        }

        if (line) {
          if (y < margin + 50) {
            page = pdfDoc.addPage([595.28, 841.89]);
            y = height - margin;
          }
          page.drawText(line, {
            x,
            y,
            size: fontSize,
            font: bodyFont,
            color: rgb(0.27, 0.27, 0.27),
          });
          y -= lineHeight;
        }
        y -= 8;
      };

      // Sections
      for (const sec of sections) {
        if (sec.header) {
          if (y < margin + 50) {
            page = pdfDoc.addPage([595.28, 841.89]);
            y = height - margin;
          }
          page.drawText(sec.header, {
            x: margin,
            y,
            size: 14,
            font: titleFont,
            color: rgb(0.15, 0.15, 0.15),
          });
          y -= 25;
        }

        for (const para of sec.content) {
          const isList = para.startsWith('•') || /^\d+\./.test(para);
          drawParagraph(para, isList);
        }
        y -= 8;
      }

      const bytes = await pdfDoc.save();
      const filename = `${sanitizeFilename(title || 'Dokument')}.pdf`;

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.status(200).send(Buffer.from(bytes));
    } catch (err) {
      const error = err as Error;
      log.error('[exportPdf] PDF export error:', error);
      return res.status(500).json({
        success: false,
        message: 'PDF export failed',
        error: error.message,
      });
    }
  }
);

export default router;
