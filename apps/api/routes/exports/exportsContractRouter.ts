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

import { extractLocaleFromRequest } from '../../services/localization/index.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { toUserFacingMessage } from '../../utils/errors/index.js';
import { setContentDisposition } from '../../utils/http/contentDisposition.js';
import { createLogger } from '../../utils/logger.js';

import { generateDocxBuffer, sanitizeDocxFilename } from './docxController.js';
import { resolveLetterheadOptions } from './letterheadSender.js';
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
      setContentDisposition(res, filename);

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
          error: toUserFacingMessage(error),
        },
      };
    }
  },

  generatePdf: async ({ body, req, res }) => {
    try {
      const { content, title, layout, letter, letterheadId, letterhead } = body;
      // AT gets its own corporate design (fonts, colours, logo), so the
      // locale has to reach the renderer. The auth middleware has already
      // overlaid req.user.locale from the DB-backed cache.
      const locale = extractLocaleFromRequest(
        req as Parameters<typeof extractLocaleFromRequest>[0]
      );

      // Resolved from the caller's OWN profile — the body carries no sender, so
      // nobody can print a foreign organisation onto Grünen paper. `req.user`
      // is undefined in the contract tests (they mount without auth); the
      // resolver returns null there instead of throwing.
      const wantsSender = layout === 'letterhead' || layout === 'letter';
      // Nicht nur der Absender: am selben Briefkopf hängen Versandweg,
      // Rücksendeangabe, Falzmarken und das eigene Briefpapier.
      const letterheadOptions = wantsSender
        ? await resolveLetterheadOptions((req as { user?: { id?: string } }).user?.id, {
            letterheadId,
            inline: letterhead,
          })
        : null;
      const sender = letterheadOptions?.sender ?? null;

      if (wantsSender && !sender) {
        // An honest error beats a file that is byte-identical to the plain
        // export — the same reasoning as the dropped-glyph guard next door.
        return {
          status: 400 as const,
          body: {
            success: false as const,
            message:
              'Für den Briefkopf sind keine Absenderangaben vorhanden. Lege einen Briefkopf in den Einstellungen an oder gib die Angaben beim Export ein.',
          },
        };
      }

      const buffer = await generatePdfBuffer(content, title, locale, {
        ...(layout && { layout }),
        sender,
        ...(letter && { letter }),
        ...(letterheadOptions && {
          dispatchMode: letterheadOptions.dispatchMode,
          returnLine: letterheadOptions.returnLine,
          foldMarks: letterheadOptions.foldMarks,
          stationery: letterheadOptions.stationery,
        }),
      });
      const filename = `${sanitizePdfFilename(title || 'Dokument')}.pdf`;

      res.setHeader('Content-Type', 'application/pdf');
      setContentDisposition(res, filename);

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
          error: toUserFacingMessage(error),
        },
      };
    }
  },
});

/**
 * Mount the ts-rest contract router onto an Express app instance.
 * Call this from routes.ts BEFORE the legacy `/api/exports` router so
 * ts-rest matches its own routes first; unmatched paths fall through.
 *
 * `createExpressEndpoints` registers directly on `app`, so any prefix
 * middleware (`requireAuth`, rate limiting) must already be mounted on
 * `/api/exports` when this runs — otherwise these routes bypass it.
 */
export function mountExportsContractRouter(app: Application): void {
  createExpressEndpoints(exportsContract, exportsContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'exportsContract'),
  });
}
