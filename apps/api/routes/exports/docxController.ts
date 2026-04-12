/**
 * DOCX Export Controller
 * Handles Word document generation with formatting and citations
 */

import express, { type Response } from 'express';
import { z } from 'zod';

import { validateBody, type TypedRequest } from '../../middleware/validateBody.js';
import { PRIMARY_DOMAIN } from '../../utils/domainUtils.js';
import { createLogger } from '../../utils/logger.js';
import { sanitizeFilename as sanitizeFilenameCentral } from '../../utils/validation/index.js';

import { parseCitationMarkers, createSourcesSection } from './citationParser.js';
import { parseFormattedContent } from './contentParser.js';

import type { Citation, ExportResponse } from './types.js';

const log = createLogger('exportDocx');

const router = express.Router();

const docxExportSchema = z.object({
  content: z.string(),
  title: z.string().optional(),
  citations: z
    .array(
      z.object({
        index: z.string(),
        document_title: z.string().optional(),
        cited_text: z.string().optional(),
        similarity_score: z.number().optional(),
        source_url: z.string().optional(),
      })
    )
    .optional(),
});

export function sanitizeDocxFilename(name: string, fallback = 'Dokument'): string {
  const sanitized = sanitizeFilenameCentral(name, fallback);
  return sanitized.slice(0, 80) || fallback;
}

const sanitizeFilename = sanitizeDocxFilename;

/**
 * Core DOCX generation logic, extracted so it can be reused by the
 * ts-rest contract router without duplicating the Express handler.
 */
export async function generateDocxBuffer(
  content: string,
  title: string | undefined,
  citations: Citation[] | undefined
): Promise<Buffer> {
  const formattedParagraphs = parseFormattedContent(content);
  const hasCitations = citations && Array.isArray(citations) && citations.length > 0;

  const docx = await import('docx');
  const { Document, Paragraph, TextRun, HeadingLevel, AlignmentType, Packer } = docx;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const textRuns: any[] = [];

      for (const segment of paragraph.segments) {
        if (hasCitations && segment.text.includes('[cite:')) {
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

      const paragraphOptions: {
        children: typeof textRuns;
        spacing: { after: number };
        alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
        indent?: { left: number };
      } = {
        children: textRuns,
        spacing: { after: isList ? 100 : 200 },
      };
      if (!isList) {
        paragraphOptions.alignment = AlignmentType.JUSTIFIED;
      }
      if (isList) {
        paragraphOptions.indent = { left: 360 };
      }
      children.push(new Paragraph(paragraphOptions));
    }
  }

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

  return Packer.toBuffer(doc);
}

/**
 * POST /api/exports/docx
 * Generate DOCX document from HTML content with formatting
 */
router.post(
  '/',
  validateBody(docxExportSchema),
  async (
    req: TypedRequest<z.infer<typeof docxExportSchema>>,
    res: Response<Buffer | ExportResponse>
  ) => {
    try {
      const { content, title, citations } = req.body;
      const buffer = await generateDocxBuffer(content, title, citations);
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
