/**
 * Binary explainable routes (images, PDF). Paths on disk are built only from
 * the row id and a validated section index — never from request text.
 *
 *   owner:  GET /api/explainables/:id/images/:n, /api/explainables/:id/pdf
 *   shared: GET /api/explainables/shared/:token/images/:n, …/:token/pdf
 */
import { slugifyName } from '@gruenerator/shared/utils';
import express, { type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';

import { renderExplainablePdf } from '../../services/explainables/explainablePdf.js';
import {
  explainableImagePath,
  getExplainableById,
  getExplainableByShareToken,
  type ExplainableRecord,
} from '../../services/explainables/explainableRepository.js';
import { extractLocaleFromRequest } from '../../services/localization/index.js';
import { createLogger } from '../../utils/logger.js';

import { canRead } from './explainableAccess.js';
import { viewerId } from './publicExplainablesContractRouter.js';

const log = createLogger('explainableFiles');

type Resolve = (req: Request) => Promise<ExplainableRecord | null | 'login_required'>;

const resolveOwn: Resolve = async (req) => {
  const row = await getExplainableById(String(req.params.id));
  return row && canRead(row, viewerId(req)) === 'owner' ? row : null;
};

const resolveShared: Resolve = async (req) => {
  const row = await getExplainableByShareToken(String(req.params.token));
  const access = canRead(row, viewerId(req));
  if (access === 'login_required') return 'login_required';
  return access === 'not_found' ? null : row;
};

/** Index of a section whose image is drawn, or null. */
export function drawnImageIndex(row: ExplainableRecord, raw: string): number | null {
  if (!/^\d{1,2}$/.test(raw)) return null;
  const n = Number(raw);
  return row.content.sections[n]?.image?.status === 'done' ? n : null;
}

function cacheControl(row: ExplainableRecord): string {
  // Short: switching a link back to private must take effect within minutes,
  // not after a day in some shared cache.
  return row.share_mode === 'public' ? 'public, max-age=300' : 'private, max-age=300';
}

function sendResolveError(res: Response, found: null | 'login_required'): void {
  if (found === 'login_required') {
    res.status(401).json({ error: 'Anmeldung erforderlich.', share_mode: 'authenticated' });
  } else {
    res.status(404).json({ error: 'Nicht gefunden.' });
  }
}

function imageHandler(resolve: Resolve) {
  return async (req: Request, res: Response): Promise<void> => {
    const found = await resolve(req);
    if (!found || found === 'login_required') return sendResolveError(res, found);
    const n = drawnImageIndex(found, String(req.params.n));
    if (n === null) {
      res.status(404).json({ error: 'Bild nicht gefunden.' });
      return;
    }
    res.setHeader('Cache-Control', cacheControl(found));
    res.type('png');
    res.sendFile(explainableImagePath(found.id, n), (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: 'Bild nicht gefunden.' });
    });
  };
}

function pdfHandler(resolve: Resolve) {
  return async (req: Request, res: Response): Promise<void> => {
    const found = await resolve(req);
    if (!found || found === 'login_required') return sendResolveError(res, found);
    try {
      const locale = extractLocaleFromRequest(req) === 'de-AT' ? 'de-AT' : 'de-DE';
      const bytes = await renderExplainablePdf(found.id, found.content, locale);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${slugifyName(found.title, 'erklaerung')}.pdf"`
      );
      res.setHeader('Cache-Control', 'private, no-store');
      res.send(bytes);
    } catch (error) {
      log.error(`PDF for ${found.id} failed: ${(error as Error).message}`);
      res.status(500).json({ error: 'Das PDF konnte nicht erstellt werden.' });
    }
  };
}

// Same budget as the app-level publicReadLimiter. The router is mounted ahead
// of that limiter and always responds, so no request is counted twice.
const sharedFilesLimiter =
  process.env.DISABLE_RATE_LIMITS === 'true'
    ? (_req: Request, _res: Response, next: NextFunction) => next()
    : rateLimit({
        windowMs: 60 * 60 * 1000,
        max: 2000,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: 'Too many requests, please try again later.' },
      });

/** Mount at `/api/explainables/shared` (optionalAuth), before the prefix limiter. */
export const explainableSharedFilesRouter = express.Router();
explainableSharedFilesRouter.get(
  '/:token/images/:n',
  sharedFilesLimiter,
  imageHandler(resolveShared)
);
explainableSharedFilesRouter.get('/:token/pdf', sharedFilesLimiter, pdfHandler(resolveShared));

/** Mount at `/api/explainables` behind requireAuth. */
export const explainableOwnerFilesRouter = express.Router();
explainableOwnerFilesRouter.get('/:id/images/:n', imageHandler(resolveOwn));
explainableOwnerFilesRouter.get('/:id/pdf', pdfHandler(resolveOwn));
