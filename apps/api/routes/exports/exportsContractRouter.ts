/**
 * ts-rest router for /api/exports (Phase 4.1 pilot)
 *
 * Wraps the existing DOCX / PDF generation helpers (`generateDocxBuffer`,
 * `generatePdfBuffer`) so they can be called through a contract-typed endpoint.
 *
 * Binary-body caveat
 * ──────────────────
 * The `exportsContract` declares `binaryFileResponseSchema = z.unknown()` for
 * 200 responses. `@ts-rest/express` serialises the `body` it receives with
 * `res.json(...)` UNLESS the body is a `stream.Stream`, in which case it
 * pipes it instead (see @ts-rest/express/index.cjs.js around line 120).
 *
 * We therefore wrap the generated `Buffer` in a `Readable.from(buffer)` and
 * set the `Content-Type` / `Content-Disposition` headers manually on `res`
 * before returning — the subsequent pipe writes the binary body unaltered.
 */

import { Readable } from 'stream';

import { exportsContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { createLogger } from '../../utils/logger.js';

import { generateDocxBuffer, sanitizeDocxFilename } from './docxController.js';
import { generatePdfBuffer, sanitizePdfFilename } from './pdfController.js';

import type { Application } from 'express';

const log = createLogger('exportsContract');

const s = initServer();

export const exportsContractRouter = s.router(exportsContract, {
  generateDocx: async ({ body, res }) => {
    try {
      const { content, title, citations } = body;
      const buffer = await generateDocxBuffer(content, title, citations);
      const filename = `${sanitizeDocxFilename(title || 'Dokument')}.docx`;

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      // Return a stream so @ts-rest/express pipes the raw bytes instead of
      // running them through res.json() (which would corrupt the binary).
      return {
        status: 200 as const,
        body: Readable.from(buffer),
      };
    } catch (err) {
      const error = err as Error;
      log.error('[Exports Contract] DOCX export error:', error);
      return {
        status: 500 as const,
        body: {
          success: false as const,
          message: 'DOCX export failed',
          error: error.message,
        },
      };
    }
  },

  generatePdf: async ({ body, res }) => {
    try {
      const { content, title } = body;
      const buffer = await generatePdfBuffer(content, title);
      const filename = `${sanitizePdfFilename(title || 'Dokument')}.pdf`;

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      return {
        status: 200 as const,
        body: Readable.from(buffer),
      };
    } catch (err) {
      const error = err as Error;
      log.error('[Exports Contract] PDF export error:', error);
      return {
        status: 500 as const,
        body: {
          success: false as const,
          message: 'PDF export failed',
          error: error.message,
        },
      };
    }
  },
});

/**
 * Mount the ts-rest contract router onto an Express app instance.
 * Call this from routes.ts BEFORE the legacy `/api/exports` router so
 * ts-rest matches its own routes first; unmatched paths fall through.
 */
export function mountExportsContractRouter(app: Application): void {
  createExpressEndpoints(exportsContract, exportsContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'exportsContract'),
  });
}
