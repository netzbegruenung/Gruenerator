/**
 * DOCX Export Controller
 * Handles Word document generation with formatting and citations
 */

import express, { Request, Response } from 'express';
import { createLogger } from '../../utils/logger.js';
import { sanitizeFilename as sanitizeFilenameCentral } from '../../utils/validation/index.js';
import { PRIMARY_DOMAIN } from '../../utils/domainUtils.js';
import { parseFormattedContent } from './contentParser.js';
import { parseCitationMarkers, createSourcesSection } from './citationParser.js';
import type { ExportRequestBody, ExportResponse } from './types.js';

const log = createLogger('exportDocx');

const router = express.Router();

function sanitizeFilename(name: string, fallback = 'Dokument'): string {
  const sanitized = sanitizeFilenameCentral(name, fallback);
  return sanitized.slice(0, 80) || fallback;
}

/**
 * POST /api/exports/docx
 * Generate DOCX document from HTML content with formatting
 */
router.post(
  '/',
  async (req: Request<{}, Buffer | ExportResponse, ExportRequestBody>, res: Response) => {
    try {
      const { content, title, citations } = req.body || {};
      const formattedParagraphs = parseFormattedContent(content);
      const hasCitations = citations && Array.isArray(citations) && citations.length > 0;

      const docx = await import('docx');
      const { Document, Paragraph, TextRun, HeadingLevel, AlignmentType, Packer } = docx;

      const children: any[] = [];
      const docTitle = title || 'Dokument';

      children.push(
        new Paragraph({
          children: [new TextRun({ text: docTitle, bold: true, size: 32, font: 'GrueneTypeNeue' })],
          heading: HeadingLevel.TITLE,
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 },
        })
      );

      // Process each paragraph with its formatting
      for (const paragraph of formattedParagraphs) {
        if (!paragraph.segments || paragraph.segments.length === 0) continue;

        const fullText = paragraph.segments.map((seg) => seg.text).join('');

        if (paragraph.isHeader) {
          const textRuns = paragraph.segments.map(
            (segment) =>
              new TextRun({
                text: segment.text,
                bold: true,
                italics: segment.italic,
                size: paragraph.headerLevel === 1 ? 28 : paragraph.headerLevel === 2 ? 26 : 24,
                font: 'GrueneTypeNeue',
              })
          );

          const headingLevel =
            paragraph.headerLevel === 1
              ? HeadingLevel.HEADING_1
              : paragraph.headerLevel === 2
                ? HeadingLevel.HEADING_2
                : HeadingLevel.HEADING_3;

          children.push(
            new Paragraph({
              children: textRuns,
              heading: headingLevel,
              spacing: { before: 300, after: 200 },
            })
          );
        } else {
          // Create regular paragraph with formatting and citation support
          const textRuns: any[] = [];

          for (const segment of paragraph.segments) {
            if (hasCitations && segment.text.includes('⚡CITE')) {
              const citationSegments = parseCitationMarkers(segment.text);

              for (const citeSeg of citationSegments) {
                if (citeSeg.isCitation) {
                  textRuns.push(
                    new TextRun({
                      text: citeSeg.text,
                      superScript: true,
                      size: 16,
                      color: '0066cc',
                      font: 'PT Sans',
                    })
                  );
                } else {
                  textRuns.push(
                    new TextRun({
                      text: citeSeg.text,
                      bold: segment.bold,
                      italics: segment.italic,
                      size: 22,
                      font: 'PT Sans',
                    })
                  );
                }
              }
            } else {
              textRuns.push(
                new TextRun({
                  text: segment.text,
                  bold: segment.bold,
                  italics: segment.italic,
                  size: 22,
                  font: 'PT Sans',
                })
              );
            }
          }

          const isList = fullText.startsWith('•') || /^\d+\./.test(fullText);

          children.push(
            new Paragraph({
              children: textRuns,
              spacing: { after: isList ? 100 : 200 },
              alignment: isList ? undefined : AlignmentType.JUSTIFIED,
              indent: isList ? { left: 360 } : undefined,
            })
          );
        }
      }

      // Add sources section if citations exist
      if (hasCitations && citations) {
        children.push(...createSourcesSection(docx, citations));
      }

      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `Erstellt mit dem Grünerator von Moritz Wächter • ${new Date().toLocaleDateString('de-DE')} • `,
              size: 18,
              italics: true,
              color: '666666',
              font: 'PT Sans',
            }),
            new TextRun({
              text: PRIMARY_DOMAIN,
              size: 18,
              italics: true,
              color: '0066cc',
              style: 'Hyperlink',
              font: 'PT Sans',
            }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { before: 600 },
        })
      );

      const doc = new Document({
        sections: [{ properties: {}, children }],
        title: docTitle,
        creator: 'Grünerator',
        description: 'Generated document from Grünerator',
      });

      const buffer = await Packer.toBuffer(doc);
      const filename = `${sanitizeFilename(title || 'Dokument')}.docx`;

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.status(200).send(buffer);
    } catch (err) {
      const error = err as Error;
      log.error('[exportDocx] DOCX export error:', error);
      return res.status(500).json({
        success: false,
        message: 'DOCX export failed',
        error: error.message,
      });
    }
  }
);

export default router;
