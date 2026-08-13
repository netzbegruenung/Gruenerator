/**
 * Chat Message DOCX Export Controller
 * Exports individual chat messages as Word documents
 */

import express, { type Response } from 'express';
import { z } from 'zod';

import { validateBody, type TypedRequest } from '../../middleware/validateBody.js';
import { PRIMARY_DOMAIN } from '../../utils/domainUtils.js';
import { toUserFacingMessage } from '../../utils/errors/index.js';
import { setContentDisposition } from '../../utils/http/contentDisposition.js';
import { createLogger } from '../../utils/logger.js';
import { sanitizeFilename as sanitizeFilenameCentral } from '../../utils/validation/index.js';

import { parseFormattedContent } from './contentParser.js';
import {
  buildNumberingConfig,
  buildPageChrome,
  isLinkable,
  loadEmbeddedFonts,
  renderBlocks,
  BODY_FONT,
  HEADING_FONT,
} from './docxRenderer.js';
import { resolveImages } from './imageResolver.js';

import type { FormattedBlock } from './types.js';
import type * as Docx from 'docx';

const log = createLogger('chatMessageExport');

const router = express.Router();

/**
 * Epoch millis. Shipped mobile binaries post an ISO string here (see
 * `apps/mobile/hooks/useMessageActions.ts`), and a strict `z.number()` rejected
 * the whole request with a 400 — the download button did nothing at all on
 * those builds. The wire format stays tolerant even after the app is fixed,
 * because the old binaries keep sending strings.
 */
const timestampSchema = z
  .union([z.number(), z.string()])
  .transform((value) => {
    const millis = typeof value === 'number' ? value : Date.parse(value);
    return Number.isFinite(millis) ? millis : null;
  })
  .nullable()
  .optional();

/**
 * The chat client posts its whole message metadata object. Only the source
 * lists are read; `.passthrough()`-free `z.object` drops the rest, and every
 * field is lenient so a shape change upstream cannot turn a download into a
 * 400.
 */
const chatMessageExportSchema = z.object({
  content: z.string(),
  role: z.enum(['user', 'assistant']).catch('assistant'),
  timestamp: timestampSchema,
  metadata: z
    .object({
      citations: z
        .array(
          z.object({
            id: z.number().catch(0),
            title: z.string().catch(''),
            url: z.string().catch(''),
            snippet: z.string().catch(''),
          })
        )
        .optional(),
      searchResults: z
        .array(
          z.object({
            source: z.string().catch(''),
            title: z.string().catch(''),
            content: z.string().catch(''),
            url: z.string().optional(),
          })
        )
        .optional(),
    })
    .optional(),
});

type ExportSource = { title: string; content: string; url?: string | undefined };

/**
 * Sources for the appendix. `searchResults` is the web-search shape;
 * `citations` is what notebook and document answers carry. Only `searchResults`
 * used to be rendered, so a document-grounded answer exported with `[1]`…`[10]`
 * markers and no list of what they pointed at.
 */
function collectSources(
  metadata: z.infer<typeof chatMessageExportSchema>['metadata']
): ExportSource[] {
  if (metadata?.searchResults && metadata.searchResults.length > 0) {
    return metadata.searchResults.map((result) => ({
      title: result.title,
      content: result.content,
      url: result.url,
    }));
  }

  if (metadata?.citations && metadata.citations.length > 0) {
    return metadata.citations.map((citation) => ({
      title: citation.id ? `[${citation.id}] ${citation.title}` : citation.title,
      content: citation.snippet,
      url: citation.url || undefined,
    }));
  }

  return [];
}

function sanitizeFilename(name: string, fallback = 'Chat-Nachricht'): string {
  const sanitized = sanitizeFilenameCentral(name, fallback);
  return sanitized.slice(0, 80) || fallback;
}

/**
 * Name the file after the answer's first heading, falling back to its opening
 * sentence. Slicing the raw markdown (the old approach) put `##`-stripped
 * fragments and half words into the download name.
 */
function filenameFromBlocks(blocks: FormattedBlock[]): string {
  const source =
    blocks.find((block) => block.kind === 'heading') ??
    blocks.find((block) => block.kind === 'paragraph');
  if (!source || !('segments' in source)) return 'Chat-Nachricht';

  const text = source.segments
    .map((segment) => segment.text)
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return 'Chat-Nachricht';

  const firstSentence = text.split(/(?<=[.!?])\s/)[0] ?? text;
  return firstSentence.slice(0, 60).trim() || 'Chat-Nachricht';
}

function formatTimestamp(timestamp?: number | null): string {
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
  validateBody(chatMessageExportSchema),
  async (
    req: TypedRequest<z.infer<typeof chatMessageExportSchema>>,
    res: Response<Buffer | { success: boolean; error?: string }>
  ) => {
    try {
      const { content, role, timestamp, metadata } = req.body;

      const blocks = parseFormattedContent(content);

      const [docx, images, fonts] = await Promise.all([
        import('docx'),
        resolveImages(blocks),
        loadEmbeddedFonts(),
      ]);
      const {
        Document,
        Paragraph,
        TextRun,
        Packer,
        BorderStyle,
        AlignmentType,
        ExternalHyperlink,
      } = docx;

      const children: Docx.FileChild[] = [];
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
              font: HEADING_FONT,
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

      children.push(...renderBlocks(docx, blocks, { images }));

      const sources = collectSources(metadata);
      if (sources.length > 0) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: 'Verwendete Quellen',
                bold: true,
                size: 24,
                font: HEADING_FONT,
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

        for (const source of sources) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: `• ${source.title || 'Unbenannte Quelle'}`,
                  bold: true,
                  size: 20,
                  font: BODY_FONT,
                }),
              ],
              spacing: { after: 50 },
              indent: { left: 360 },
            })
          );

          if (source.content) {
            children.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: source.content.slice(0, 200) + (source.content.length > 200 ? '…' : ''),
                    size: 18,
                    font: BODY_FONT,
                    color: '666666',
                  }),
                ],
                spacing: { after: 50 },
                indent: { left: 720 },
              })
            );
          }

          if (source.url) {
            const urlRun = new TextRun({
              text: source.url,
              size: 16,
              font: BODY_FONT,
              style: 'Hyperlink',
            });
            children.push(
              new Paragraph({
                children: [
                  isLinkable(source.url)
                    ? new ExternalHyperlink({ children: [urlRun], link: source.url })
                    : urlRun,
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
        sections: [
          {
            properties: {},
            ...buildPageChrome(docx, `${roleLabel} • ${formattedTime}`),
            children,
          },
        ],
        numbering: buildNumberingConfig(docx),
        fonts,
        title: `Chat-Nachricht - ${roleLabel}`,
        creator: 'Grünerator',
        description: 'Chat message exported from Grünerator',
      });

      const buffer = await Packer.toBuffer(doc);

      const filename = `${sanitizeFilename(filenameFromBlocks(blocks))}.docx`;

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
      setContentDisposition(res, filename);
      return res.status(200).send(buffer);
    } catch (err) {
      const error = err as Error;
      log.error('[chatMessageExport] DOCX export error:', error);
      return res.status(500).json({
        success: false,
        error: toUserFacingMessage(error),
      });
    }
  }
);

export default router;
