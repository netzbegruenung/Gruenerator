/**
 * Grünerator-Vorlagen for sharepics — see
 * `packages/contracts/src/contracts/sharepicVorlagenContract.ts`. The entries
 * come from the private checkout (`services/sharepicVorlagen/catalog.ts`).
 */
import { existsSync } from 'node:fs';

import { sharepicVorlagenContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { extractLocaleFromRequest } from '../../services/localization/index.js';
import {
  getSharepicVorlage,
  listSharepicVorlagen,
  sharepicVorlageThumbFile,
} from '../../services/sharepicVorlagen/catalog.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';

import type { Application, Request, Response } from 'express';

const log = createLogger('sharepicVorlagenRouter');

const s = initServer();

export const sharepicVorlagenContractRouter = s.router(sharepicVorlagenContract, {
  // The country is detected, never chosen: a Vorlage in the other country's
  // design would not be one the viewer can use.
  list: async ({ req }) => {
    getAuthedUser(req);
    const locale = extractLocaleFromRequest(req) === 'de-AT' ? 'de-AT' : 'de-DE';
    return { status: 200 as const, body: { vorlagen: listSharepicVorlagen(locale) } };
  },
  get: async ({ req, params }) => {
    getAuthedUser(req);
    const vorlage = getSharepicVorlage(params.id);
    if (!vorlage) return { status: 404 as const, body: { error: 'Vorlage nicht gefunden.' } };
    return { status: 200 as const, body: vorlage };
  },
});

function sendThumb(req: Request, res: Response): void {
  const file = sharepicVorlageThumbFile(String(req.params.id), Number(req.query.seite ?? 1));
  if (!file || !existsSync(file)) {
    res.status(404).json({ error: 'Kein Vorschaubild.' });
    return;
  }
  // Private: the image shows party content, so no shared caches.
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.type('image/webp').sendFile(file);
}

/** Mount after `requireAuth` on `/api/sharepic-vorlagen`. */
export function mountSharepicVorlagenRouter(app: Application): void {
  app.get('/api/sharepic-vorlagen/:id/thumb', sendThumb);
  createExpressEndpoints(sharepicVorlagenContract, sharepicVorlagenContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'sharepicVorlagenContract'),
  });
}
