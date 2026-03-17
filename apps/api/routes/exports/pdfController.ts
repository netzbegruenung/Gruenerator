/**
 * PDF Export Controller
 * Handles PDF document generation with custom fonts and emoji support
 */

import fs from 'fs/promises';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

import fontkit from '@pdf-lib/fontkit';
import express, { type Request, type Response } from 'express';

import { createLogger } from '../../utils/logger.js';
import { sanitizeFilename as sanitizeFilenameCentral } from '../../utils/validation/index.js';

import { htmlToPlainText, parseSections } from './contentParser.js';

import type { ExportRequestBody, ExportResponse } from './types.js';
import type { PDFFont, PDFPage, RGB } from 'pdf-lib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const log = createLogger('exportPdf');

const router = express.Router();

function sanitizeFilename(name: string, fallback = 'Dokument'): string {
  const sanitized = sanitizeFilenameCentral(name, fallback);
  return sanitized.slice(0, 80) || fallback;
}

const EMOJI_REGEX = /(\p{Emoji_Presentation}|\p{Extended_Pictographic})/gu;

interface FontRun {
  text: string;
  font: PDFFont;
}

function splitIntoFontRuns(text: string, textFont: PDFFont, emFont: PDFFont): FontRun[] {
  const runs: FontRun[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(EMOJI_REGEX)) {
    const idx = match.index!;
    if (idx > lastIndex) {
      runs.push({ text: text.slice(lastIndex, idx), font: textFont });
    }
    runs.push({ text: match[0], font: emFont });
    lastIndex = idx + match[0].length;
  }

  if (lastIndex < text.length) {
    runs.push({ text: text.slice(lastIndex), font: textFont });
  }

  return runs.length ? runs : [{ text, font: textFont }];
}

function measureRuns(runs: FontRun[], fontSize: number): number {
  return runs.reduce((w, r) => w + r.font.widthOfTextAtSize(r.text, fontSize), 0);
}

function drawRuns(
  page: PDFPage,
  runs: FontRun[],
  startX: number,
  y: number,
  fontSize: number,
  color: RGB
): void {
  let x = startX;
  for (const run of runs) {
    page.drawText(run.text, { x, y, size: fontSize, font: run.font, color });
    x += run.font.widthOfTextAtSize(run.text, fontSize);
  }
}

/**
 * POST /api/exports/pdf
 * Generate PDF document from HTML content
 */
router.post(
  '/',
  async (
    req: Request<Record<string, never>, Buffer | ExportResponse, ExportRequestBody>,
    res: Response
  ) => {
    try {
      const { content, title } = req.body || {};
      const plain = htmlToPlainText(content);
      const sections = parseSections(plain);

      const { PDFDocument, rgb } = await import('pdf-lib');

      const pdfDoc = await PDFDocument.create();
      pdfDoc.registerFontkit(fontkit);
      let page = pdfDoc.addPage([595.28, 841.89]); // A4
      const { width, height } = page.getSize();
      const margin = 40;
      let y = height - margin;

      const fontsDir = path.join(__dirname, '..', '..', 'public', 'fonts');
      const [grueneTypeBytes, ptSansRegularBytes, notoEmojiBytes] = await Promise.all([
        fs.readFile(path.join(fontsDir, 'GrueneTypeNeue-Regular.ttf')),
        fs.readFile(path.join(fontsDir, 'PTSans-Regular.ttf')),
        fs.readFile(path.join(fontsDir, 'NotoEmoji-Regular.ttf')),
      ]);

      const titleFont = await pdfDoc.embedFont(grueneTypeBytes);
      const bodyFont = await pdfDoc.embedFont(ptSansRegularBytes);
      const emojiFont = await pdfDoc.embedFont(notoEmojiBytes);

      const bodyColor = rgb(0.27, 0.27, 0.27);
      const headingColor = rgb(0.15, 0.15, 0.15);

      // Title
      const docTitle = title || 'Dokument';
      const titleSize = 20;
      const titleRuns = splitIntoFontRuns(docTitle, titleFont, emojiFont);
      const titleWidth = measureRuns(titleRuns, titleSize);
      drawRuns(page, titleRuns, (width - titleWidth) / 2, y, titleSize, headingColor);
      y -= 40;

      const drawParagraph = (text: string, isList = false): void => {
        const fontSize = 11;
        const lineHeight = fontSize * 1.5;
        const maxWidth = width - margin * 2 - (isList ? 20 : 0);
        const x = margin + (isList ? 20 : 0);
        const words = text.split(' ');
        let lineWords: string[] = [];

        const flushLine = () => {
          if (lineWords.length === 0) return;
          if (y < margin + 50) {
            page = pdfDoc.addPage([595.28, 841.89]);
            y = height - margin;
          }
          const lineText = lineWords.join(' ');
          const runs = splitIntoFontRuns(lineText, bodyFont, emojiFont);
          drawRuns(page, runs, x, y, fontSize, bodyColor);
          y -= lineHeight;
          lineWords = [];
        };

        for (const w of words) {
          const testText = lineWords.length ? [...lineWords, w].join(' ') : w;
          const testRuns = splitIntoFontRuns(testText, bodyFont, emojiFont);
          const testWidth = measureRuns(testRuns, fontSize);

          if (testWidth <= maxWidth) {
            lineWords.push(w);
          } else {
            flushLine();
            lineWords = [w];
          }
        }

        flushLine();
        y -= 8;
      };

      for (const sec of sections) {
        if (sec.header) {
          if (y < margin + 50) {
            page = pdfDoc.addPage([595.28, 841.89]);
            y = height - margin;
          }
          const headerRuns = splitIntoFontRuns(sec.header, titleFont, emojiFont);
          drawRuns(page, headerRuns, margin, y, 14, headingColor);
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
