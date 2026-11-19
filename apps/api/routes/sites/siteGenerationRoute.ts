/**
 * POST /api/sites/generate — site content from a description or a flyer PDF, streamed as SSE.
 *
 * Everything that can be refused is refused as JSON before the stream opens: the upload limits
 * (413/400 in `flyerUpload`), the body (ts-rest validation), the source and the PDF magic bytes.
 * Auth, sites access, AI consent and the AI limiter run on the prefix in routes.ts.
 */
import { SITE_FLYER_FIELD, SITE_FLYER_MAX_BYTES, sitesContract } from '@gruenerator/contracts';
import { initServer } from '@ts-rest/express';
import { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';

import { extractLocaleFromRequest } from '../../services/localization/index.js';
import { isPdfBuffer } from '../../services/sites/generation/flyer/isPdfBuffer.js';
import {
  runSiteGeneration,
  type SiteGenerationSource,
} from '../../services/sites/generation/runSiteGeneration.js';
import { createLogger } from '../../utils/logger.js';
import { createSSEStream } from '../chat/services/sseHelpers.js';

const log = createLogger('sites:generate');

export const GENERATION_HEARTBEAT_MS = 20_000;

const FILE_TOO_LARGE_MESSAGE = 'Die Datei ist zu groß. Maximal 20 MB erlaubt.';
const UPLOAD_FAILED_MESSAGE = 'Die Datei konnte nicht hochgeladen werden.';
const NOT_A_PDF_MESSAGE = 'Nur PDF-Dateien sind erlaubt.';
const BOTH_SOURCES_MESSAGE = 'Bitte gib entweder eine Beschreibung ein oder lade einen Flyer hoch.';
const NO_SOURCE_MESSAGE = 'Bitte beschreib dich kurz oder lade einen Flyer hoch.';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: SITE_FLYER_MAX_BYTES, files: 1, fields: 4 },
  defParamCharset: 'utf8',
}).single(SITE_FLYER_FIELD);

export function flyerUpload(req: Request, res: Response, next: NextFunction): void {
  upload(req, res, (err: unknown) => {
    if (!err) return next();
    const code = err instanceof multer.MulterError ? err.code : null;
    log.warn('flyer upload rejected: %s', code ?? 'unknown');
    if (code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: FILE_TOO_LARGE_MESSAGE });
      return;
    }
    res.status(400).json({ error: UPLOAD_FAILED_MESSAGE });
  });
}

const s = initServer();

export const generateSiteContentRoute = s.route(sitesContract.generateSiteContent, {
  middleware: [flyerUpload],
  handler: async ({ req, res, body }) => {
    const file = req.file;
    const description = body.description;

    if (description && file) {
      return { status: 400 as const, body: { error: BOTH_SOURCES_MESSAGE } };
    }
    if (!description && !file) {
      return { status: 400 as const, body: { error: NO_SOURCE_MESSAGE } };
    }
    if (file && !isPdfBuffer(file.buffer)) {
      return { status: 400 as const, body: { error: NOT_A_PDF_MESSAGE } };
    }

    const source: SiteGenerationSource = file
      ? { kind: 'flyer', pdf: file.buffer }
      : { kind: 'text', description: description ?? '' };

    const sse = createSSEStream(res);
    const controller = new AbortController();
    let finished = false;
    res.on('close', () => {
      if (!finished) controller.abort();
    });
    const heartbeat = setInterval(
      () => sse.sendRaw('heartbeat', { type: 'heartbeat' }),
      GENERATION_HEARTBEAT_MS
    );

    try {
      await runSiteGeneration(
        {
          source,
          email: body.email ?? '',
          locale: extractLocaleFromRequest(req),
          signal: controller.signal,
        },
        (event) => sse.sendRaw(event.type, event)
      );
    } finally {
      finished = true;
      clearInterval(heartbeat);
      sse.end();
    }
    return { status: 200 as const, body: undefined };
  },
});
