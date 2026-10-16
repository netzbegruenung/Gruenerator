/**
 * Grünerator-Vorlagen for sharepics — see
 * `packages/contracts/src/contracts/sharepicVorlagenContract.ts`. The entries
 * come from the private checkout (`services/sharepicVorlagen/catalog.ts`).
 */
import { existsSync } from 'node:fs';

import { sharepicVorlagenContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import {
  getSharepicSeite,
  getSharepicVorlage,
  listSharepicSeiten,
  listSharepicVorlagen,
  sharepicSeiteThumbFile,
  sharepicVorlageThumbFile,
} from '../../services/sharepicVorlagen/catalog.js';
import { resolveVorlagenLocale } from '../../services/sharepicVorlagen/vorlagenLocale.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';

import type { Application, Request, Response } from 'express';

const log = createLogger('sharepicVorlagenRouter');

const s = initServer();

export const sharepicVorlagenContractRouter = s.router(sharepicVorlagenContract, {
  // The country is detected, not chosen: a Vorlage in the other country's
  // design would not be one the viewer can use. Only instance admins may
  // look at the other one (`land`), to curate both catalogues.
  list: async ({ req, query }) => {
    getAuthedUser(req);
    const locale = await resolveVorlagenLocale(req, query.land);
    return { status: 200 as const, body: { vorlagen: listSharepicVorlagen(locale) } };
  },
  seiten: async ({ req, query }) => {
    getAuthedUser(req);
    const locale = await resolveVorlagenLocale(req, query.land);
    return { status: 200 as const, body: { seiten: listSharepicSeiten(locale) } };
  },
  get: async ({ req, params }) => {
    getAuthedUser(req);
    const vorlage = getSharepicVorlage(params.id);
    if (!vorlage) return { status: 404 as const, body: { error: 'Vorlage nicht gefunden.' } };
    return { status: 200 as const, body: vorlage };
  },
});

function sendThumb(req: Request, res: Response): void {
  const id = String(req.params.id);
  sendThumbFile(
    req,
    res,
    sharepicVorlageThumbFile(id, Number(req.query.seite ?? 1)),
    getSharepicVorlage(id)?.thumbVersion
  );
}

function sendSeiteThumb(req: Request, res: Response): void {
  const id = String(req.params.id);
  sendThumbFile(
    req,
    res,
    sharepicSeiteThumbFile(id, String(req.query.format)),
    getSharepicSeite(id)?.thumbVersion
  );
}

function sendThumbFile(
  req: Request,
  res: Response,
  file: string | null,
  current: string | undefined
): void {
  if (!file || !existsSync(file)) {
    res.status(404).json({ error: 'Kein Vorschaubild.' });
    return;
  }
  // Private: the image shows party content, so no shared caches. A URL carrying
  // the current content hash never changes; any other revalidates (ETag).
  const versioned = current !== undefined && req.query.v === current;
  res.setHeader(
    'Cache-Control',
    versioned ? 'private, max-age=31536000, immutable' : 'private, no-cache'
  );
  res.type('image/webp').sendFile(file);
}

/** Mount after `requireAuth` on `/api/sharepic-vorlagen`. */
export function mountSharepicVorlagenRouter(app: Application): void {
  app.get('/api/sharepic-vorlagen/:id/thumb', sendThumb);
  app.get('/api/sharepic-vorlagen/seiten/:id/thumb', sendSeiteThumb);
  createExpressEndpoints(sharepicVorlagenContract, sharepicVorlagenContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'sharepicVorlagenContract'),
  });
}
