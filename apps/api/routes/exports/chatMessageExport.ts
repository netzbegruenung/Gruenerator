/**
 * Chat Message DOCX Export Controller
 * Exports individual chat messages as Word documents
 */

import express, { Request, Response } from 'express';
import { createLogger } from '../../utils/logger.js';
import { sanitizeFilename as sanitizeFilenameCentral } from '../../utils/validation/index.js';
import { PRIMARY_DOMAIN } from '../../utils/domainUtils.js';
import { parseFormattedContent } from './contentParser.js';

const log = createLogger('chatMessageExport');

const router = express.Router();

interface ChatMessageExportRequest {
  content: string;
  role: 'user' | 'assistant';
  timestamp?: number;
  metadata?: {
    citations?: Array<{
      id: number;
      title: string;
      url: string;
      snippet: string;
    }>;
    searchResults?: Array<{
      source: string;
      title: string;
      content: string;
      url?: string;
    }>;
  };
}

function sanitizeFilename(name: string, fallback = 'Chat-Nachricht'): string {
  const sanitized = sanitizeFilenameCentral(name, fallback);
  return sanitized.slice(0, 80) || fallback;
}

function formatTimestamp(timestamp?: number): string {
  const date = timestamp ? new Date(timestamp) : new Date();
  return date.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getRoleLabel(role: 'user' | 'assistant'): string {
  return role === 'user' ? 'Benutzer' : 'Assistent';
}

/**
 * POST /api/exports/chat-message
 * Generate DOCX document from a chat message
 */
router.post(
  '/',
  async (req: Request<{}, Buffer | { success: boolean; error?: string }, ChatMessageExportRequest>, res: Response) => {
    try {
      const { content, role, timestamp, metadata } = req.body || {};

      if (!content) {
        return res.status(400).json({
          success: false,
          error: 'Content is required',
        });
      }

      const formattedParagraphs = parseFormattedContent(content);

      const docx = await import('docx');
      const { Document, Paragraph, TextRun, HeadingLevel, AlignmentType, Packer, BorderStyle } = docx;

      const children: any[] = [];
      const roleLabel = getRoleLabel(role || 'assistant');
      const formattedTime = formatTimestamp(timestamp);

      // Header with role and timestamp
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `${roleLabel} • ${formattedTime}`,
              bold: true,
              size: 24,
              font: 'GrueneTypeNeue',
              color: '666666',
            }),
          ],
          spacing: { after: 300 },
          border: {
            bottom: {
              style: BorderStyle.SINGLE,
              size: 6,
              color: 'e0e0e0',
            },
          },
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
          const textRuns = paragraph.segments.map(
            (segment) =>
              new TextRun({
                text: segment.text,
                bold: segment.bold,
                italics: segment.italic,
                size: 22,
                font: 'PT Sans',
              })
          );

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

      // Add search results/sources section if available
      if (metadata?.searchResults && metadata.searchResults.length > 0) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: 'Verwendete Quellen',
                bold: true,
                size: 24,
                font: 'GrueneTypeNeue',
              }),
            ],
            spacing: { before: 400, after: 200 },
            border: {
              top: {
                style: BorderStyle.SINGLE,
                size: 6,
                color: 'e0e0e0',
              },
            },
          })
        );

        for (const result of metadata.searchResults) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: `• ${result.title}`,
                  bold: true,
                  size: 20,
                  font: 'PT Sans',
                }),
              ],
              spacing: { after: 50 },
              indent: { left: 360 },
            })
          );

          if (result.content) {
            children.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: result.content.slice(0, 200) + (result.content.length > 200 ? '...' : ''),
                    size: 18,
                    font: 'PT Sans',
                    color: '666666',
                  }),
                ],
                spacing: { after: 50 },
                indent: { left: 720 },
              })
            );
          }

          if (result.url) {
            children.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: result.url,
                    size: 16,
                    font: 'PT Sans',
                    color: '0066cc',
                    style: 'Hyperlink',
                  }),
                ],
                spacing: { after: 150 },
                indent: { left: 720 },
              })
            );
          }
        }
      }

      // Footer with branding
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `Erstellt mit dem Grünerator • ${new Date().toLocaleDateString('de-DE')} • `,
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
        title: `Chat-Nachricht - ${roleLabel}`,
        creator: 'Grünerator',
        description: 'Chat message exported from Grünerator',
      });

      const buffer = await Packer.toBuffer(doc);

      // Create filename from content preview
      const contentPreview = content.slice(0, 30).replace(/[^a-zA-Z0-9äöüÄÖÜß\s]/g, '').trim();
      const filename = `${sanitizeFilename(contentPreview || 'Chat-Nachricht')}.docx`;

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.status(200).send(buffer);
    } catch (err) {
      const error = err as Error;
      log.error('[chatMessageExport] DOCX export error:', error);
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

export default router;
