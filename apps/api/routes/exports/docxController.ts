/**
 * DOCX Export Controller
 * Handles Word document generation with formatting and citations
 */

import express, { type Response } from 'express';
import { z } from 'zod';

import { validateBody, type TypedRequest } from '../../middleware/validateBody.js';
import { PRIMARY_DOMAIN } from '../../utils/domainUtils.js';
import { toUserFacingMessage } from '../../utils/errors/index.js';
import { setContentDisposition } from '../../utils/http/contentDisposition.js';
import { createLogger } from '../../utils/logger.js';
import { sanitizeFilename as sanitizeFilenameCentral } from '../../utils/validation/index.js';

import { createSourcesSection } from './citationParser.js';
import { parseFormattedContent } from './contentParser.js';
import { buildNumberingConfig, renderBlocks, BODY_FONT, HEADING_FONT } from './docxRenderer.js';

import type { Citation, ExportResponse } from './types.js';
import type * as Docx from 'docx';

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
  const blocks = parseFormattedContent(content);
  const hasCitations = citations && Array.isArray(citations) && citations.length > 0;

  const docx = await import('docx');
  const { Document, Paragraph, TextRun, HeadingLevel, AlignmentType, Packer } = docx;

  const children: Docx.FileChild[] = [];
  const docTitle = title || 'Dokument';

  children.push(
    new Paragraph({
      children: [new TextRun({ text: docTitle, bold: true, size: 32, font: HEADING_FONT })],
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    })
  );

  children.push(...renderBlocks(docx, blocks, { withCitations: Boolean(hasCitations) }));

  if (hasCitations && citations) {
    children.push(...(createSourcesSection(docx, citations) as Docx.FileChild[]));
  }

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Erstellt mit dem Grünerator von Moritz Wächter • ${new Date().toLocaleDateString('de-DE')} • `,
          size: 18,
          italics: true,
          color: '666666',
          font: BODY_FONT,
        }),
        new TextRun({
          text: PRIMARY_DOMAIN,
          size: 18,
          italics: true,
          color: '0066cc',
          style: 'Hyperlink',
          font: BODY_FONT,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { before: 600 },
    })
  );

  const doc = new Document({
    sections: [{ properties: {}, children }],
    numbering: buildNumberingConfig(docx),
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
      setContentDisposition(res, filename);
      return res.status(200).send(buffer);
    } catch (err) {
      const error = err as Error;
      log.error('[exportDocx] DOCX export error:', error);
      return res.status(500).json({
        success: false,
        message: 'DOCX export failed',
        error: toUserFacingMessage(error),
      });
    }
  }
);

export default router;
