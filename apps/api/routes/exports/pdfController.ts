/**
 * PDF Export Controller
 * Handles PDF document generation with formatting, custom fonts, and emoji support
 */

import fs from 'fs/promises';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

import fontkit from '@pdf-lib/fontkit';
import express, { type Request, type Response } from 'express';

import { createLogger } from '../../utils/logger.js';
import { sanitizeFilename as sanitizeFilenameCentral } from '../../utils/validation/index.js';

import { parseFormattedContent } from './contentParser.js';

import type { ExportRequestBody, ExportResponse, FormattedSegment } from './types.js';
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

interface FontSet {
  regular: PDFFont;
  bold: PDFFont;
  emoji: PDFFont;
}

function pickFont(segment: FormattedSegment, fonts: FontSet): PDFFont {
  if (segment.bold) return fonts.bold;
  return fonts.regular;
}

function splitIntoFontRuns(text: string, textFont: PDFFont, emojiFont: PDFFont): FontRun[] {
  const runs: FontRun[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(EMOJI_REGEX)) {
    const idx = match.index!;
    if (idx > lastIndex) {
      runs.push({ text: text.slice(lastIndex, idx), font: textFont });
    }
    runs.push({ text: match[0], font: emojiFont });
    lastIndex = idx + match[0].length;
  }

  if (lastIndex < text.length) {
    runs.push({ text: text.slice(lastIndex), font: textFont });
  }

  return runs.length ? runs : [{ text, font: textFont }];
}

function segmentsToRuns(segments: FormattedSegment[], fonts: FontSet): FontRun[] {
  const runs: FontRun[] = [];
  for (const seg of segments) {
    const textFont = pickFont(seg, fonts);
    runs.push(...splitIntoFontRuns(seg.text, textFont, fonts.emoji));
  }
  return runs;
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
 * Generate PDF document from HTML content with formatting
 */
router.post(
  '/',
  async (
    req: Request<Record<string, never>, Buffer | ExportResponse, ExportRequestBody>,
    res: Response
  ) => {
    try {
      const { content, title } = req.body || {};
      const paragraphs = parseFormattedContent(content);

      const { PDFDocument, rgb } = await import('pdf-lib');

      const pdfDoc = await PDFDocument.create();
      pdfDoc.registerFontkit(fontkit);
      let page = pdfDoc.addPage([595.28, 841.89]); // A4
      const { width, height } = page.getSize();
      const margin = 40;
      let y = height - margin;

      const fontsDir = path.join(__dirname, '..', '..', 'public', 'fonts');
      const [grueneTypeBytes, ptSansRegularBytes, ptSansBoldBytes, notoEmojiBytes] =
        await Promise.all([
          fs.readFile(path.join(fontsDir, 'GrueneTypeNeue-Regular.ttf')),
          fs.readFile(path.join(fontsDir, 'PTSans-Regular.ttf')),
          fs.readFile(path.join(fontsDir, 'PTSans-Bold.ttf')),
          fs.readFile(path.join(fontsDir, 'NotoEmoji-Regular.ttf')),
        ]);

      const titleFont = await pdfDoc.embedFont(grueneTypeBytes);
      const bodyFont = await pdfDoc.embedFont(ptSansRegularBytes);
      const boldFont = await pdfDoc.embedFont(ptSansBoldBytes);
      const emojiFont = await pdfDoc.embedFont(notoEmojiBytes);

      const fonts: FontSet = { regular: bodyFont, bold: boldFont, emoji: emojiFont };
      const bodyColor = rgb(0.27, 0.27, 0.27);
      const headingColor = rgb(0.15, 0.15, 0.15);

      // Title
      const docTitle = title || 'Dokument';
      const titleSize = 20;
      const titleRuns = splitIntoFontRuns(docTitle, titleFont, emojiFont);
      const titleWidth = measureRuns(titleRuns, titleSize);
      drawRuns(page, titleRuns, (width - titleWidth) / 2, y, titleSize, headingColor);
      y -= 40;

      const ensureSpace = (needed: number) => {
        if (y < margin + needed) {
          page = pdfDoc.addPage([595.28, 841.89]);
          y = height - margin;
        }
      };

      const drawFormattedParagraph = (segments: FormattedSegment[], isList = false): void => {
        const fontSize = 11;
        const lineHeight = fontSize * 1.5;
        const indent = isList ? 20 : 0;
        const maxWidth = width - margin * 2 - indent;
        const x = margin + indent;

        const allRuns = segmentsToRuns(segments, fonts);

        // Word-wrap: split runs into words, reflow into lines
        const fullText = allRuns.map((r) => r.text).join('');
        const words = fullText.split(' ');

        let lineRuns: FontRun[] = [];
        let lineWidth = 0;

        const flushLine = () => {
          if (lineRuns.length === 0) return;
          ensureSpace(50);
          drawRuns(page, lineRuns, x, y, fontSize, bodyColor);
          y -= lineHeight;
          lineRuns = [];
          lineWidth = 0;
        };

        for (let i = 0; i < words.length; i++) {
          const word = i > 0 ? ' ' + words[i] : words[i];
          const wordRuns = buildRunsForSubstring(word, allRuns, fonts);
          const wordWidth = measureRuns(wordRuns, fontSize);

          if (lineWidth + wordWidth > maxWidth && lineRuns.length > 0) {
            flushLine();
            // Re-add without leading space
            const trimmedRuns = buildRunsForSubstring(words[i], allRuns, fonts);
            lineRuns = trimmedRuns;
            lineWidth = measureRuns(trimmedRuns, fontSize);
          } else {
            lineRuns.push(...wordRuns);
            lineWidth += wordWidth;
          }
        }

        flushLine();
        y -= 8;
      };

      for (const paragraph of paragraphs) {
        if (!paragraph.segments || paragraph.segments.length === 0) continue;

        if (paragraph.isHeader) {
          ensureSpace(50);
          const headerSize =
            paragraph.headerLevel === 1 ? 16 : paragraph.headerLevel === 2 ? 14 : 13;
          const headerRuns = segmentsToRuns(paragraph.segments, {
            regular: titleFont,
            bold: titleFont,
            emoji: emojiFont,
          });
          drawRuns(page, headerRuns, margin, y, headerSize, headingColor);
          y -= headerSize + 12;
        } else {
          const fullText = paragraph.segments.map((s) => s.text).join('');
          const isList = fullText.startsWith('•') || /^\d+\./.test(fullText);
          drawFormattedParagraph(paragraph.segments, isList);
        }
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

/**
 * Build font runs for a substring by mapping each character back to its
 * original segment's font. This preserves bold/italic across word boundaries.
 */
function buildRunsForSubstring(substring: string, allRuns: FontRun[], fonts: FontSet): FontRun[] {
  // Fast path: no emoji, use a simple approach
  const hasEmoji = EMOJI_REGEX.test(substring);
  EMOJI_REGEX.lastIndex = 0;

  if (!hasEmoji) {
    // Determine which font this substring falls into by finding it in the original runs
    const font = findFontForText(substring.trim(), allRuns) || fonts.regular;
    return [{ text: substring, font }];
  }

  return splitIntoFontRuns(
    substring,
    findFontForText(substring.replace(EMOJI_REGEX, '').trim(), allRuns) || fonts.regular,
    fonts.emoji
  );
}

/**
 * Find which font a text snippet belongs to by checking the original runs.
 */
function findFontForText(text: string, allRuns: FontRun[]): PDFFont | null {
  if (!text) return null;
  for (const run of allRuns) {
    if (run.text.includes(text)) return run.font;
  }
  // Check word by word for partial matches
  const firstWord = text.split(' ')[0];
  if (firstWord) {
    for (const run of allRuns) {
      if (run.text.includes(firstWord)) return run.font;
    }
  }
  return null;
}

export default router;
