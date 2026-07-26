/**
 * PDF Export Controller
 *
 * Turns stored document content (markdown or HTML) into a PDF. The layout,
 * font handling and — crucially — the PDF/UA tagging all live in
 * `services/pdf/pdfRenderer.ts`, which the chat's create_pdf path already
 * uses; this controller only adapts the content into that renderer's block
 * model. Before that consolidation the export wrote its own untagged pages,
 * so every exported document was a flat run of text to a screen reader.
 */

import express, { type Request, type Response } from 'express';

import { contentToBlocks } from '../../services/pdf/contentToBlocks.js';
import { renderPdf, type PdfLocale, type PdfSender } from '../../services/pdf/pdfRenderer.js';
import { toUserFacingMessage } from '../../utils/errors/index.js';
import { setContentDisposition } from '../../utils/http/contentDisposition.js';
import { createLogger } from '../../utils/logger.js';
import { sanitizeFilename as sanitizeFilenameCentral } from '../../utils/validation/index.js';

import type { ExportRequestBody, ExportResponse } from './types.js';
import type { PdfDocumentSpec } from '../../services/pdf/pdfDocument.js';
import type { PdfExportLayout, pdfExportLetterSchema } from '@gruenerator/contracts';
import type { z } from 'zod';

type PdfExportLetter = z.infer<typeof pdfExportLetterSchema>;

const log = createLogger('exportPdf');

const router = express.Router();

export function sanitizePdfFilename(name: string, fallback = 'Dokument'): string {
  const sanitized = sanitizeFilenameCentral(name, fallback);
  return sanitized.slice(0, 80) || fallback;
}

const sanitizeFilename = sanitizePdfFilename;

/**
 * Core PDF generation logic, extracted so it can be reused by the
 * ts-rest contract router without duplicating the Express handler.
 */
export interface PdfExportOptions {
  /** See PdfExportLayout — 'letterhead' adds the Absender, 'letter' is DIN 5008. */
  layout?: PdfExportLayout;
  /** Resolved server-side from the caller's profile; never taken from the body. */
  sender?: PdfSender | null;
  letter?: PdfExportLetter;
}

export async function generatePdfBuffer(
  content: string,
  title: string | undefined,
  locale: PdfLocale = 'de-DE',
  options: PdfExportOptions = {}
): Promise<Buffer> {
  const layout = options.layout ?? 'document';
  const isLetter = layout === 'letter';

  const spec: PdfDocumentSpec = {
    title: (title ?? '').trim() || 'Dokument',
    // 'document' for BOTH 'document' and 'letterhead': the letterhead is an
    // additive band, not a layout. Making it a letter here would drag in
    // recipient, date, subject and salutation furniture the user did not ask
    // for — the one thing this feature must not do.
    kind: isLetter ? 'letter' : 'document',
    language: locale,
    blocks: contentToBlocks(content ?? ''),
    ...(isLetter && options.letter && { letter: options.letter }),
  };

  const rendered = await renderPdf(spec, {
    locale,
    sender: options.sender ?? null,
    letterhead: layout === 'letterhead',
  });
  if (rendered.missingGlyphs.length) {
    log.warn(
      `[exportPdf] ${rendered.missingGlyphs.length} Zeichen ohne Glyphe entfernt: ${rendered.missingGlyphs.join(' ')}`
    );
  }

  // Zeichen, für die keine eingebettete Schrift eine Glyphe hat, werden still
  // verworfen — PDF/UA lässt nichts anderes zu. Bei einem chinesischen oder
  // arabischen Dokument ist danach die Seite LEER, und weil sie formal
  // einwandfrei getaggt ist, meldet weder veraPDF noch die Eigenprüfung etwas.
  // Ein ehrlicher Fehler ist besser als eine leere Datei, die aussieht, als
  // hätte der Export funktioniert.
  const share = droppedShare(content ?? '', rendered.missingGlyphs);
  if (share > 0.1) {
    const sample = rendered.missingGlyphs.slice(0, 8).join(' ');
    throw new Error(
      `Der Text enthält zu viele Zeichen, die die verwendeten Schriften nicht darstellen können (${Math.round(share * 100)} %, z. B. ${sample}). Das PDF wäre weitgehend leer geworden.`
    );
  }
  return rendered.bytes;
}

/** Anteil der Quellzeichen, die keine Glyphe hatten — ohne Leerraum gerechnet. */
function droppedShare(content: string, missingGlyphs: string[]): number {
  if (!missingGlyphs.length) return 0;
  const missing = new Set(missingGlyphs);
  let dropped = 0;
  let total = 0;
  for (const char of content.normalize('NFC')) {
    if (/\s/.test(char)) continue;
    total += 1;
    if (missing.has(char)) dropped += 1;
  }
  return total ? dropped / total : 0;
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
      const buffer = await generatePdfBuffer(content, title);
      const filename = `${sanitizeFilename(title || 'Dokument')}.pdf`;

      res.setHeader('Content-Type', 'application/pdf');
      setContentDisposition(res, filename);
      return res.status(200).send(buffer);
    } catch (err) {
      const error = err as Error;
      log.error('[exportPdf] PDF export error:', error);
      return res.status(500).json({
        success: false,
        message: 'PDF export failed',
        error: toUserFacingMessage(error),
      });
    }
  }
);

export default router;
