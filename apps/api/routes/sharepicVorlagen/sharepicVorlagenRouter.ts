/**
 * Grünerator-Vorlagen for sharepics — see
 * `packages/contracts/src/contracts/sharepicVorlagenContract.ts`. The entries
 * come from the private checkout (`services/sharepicVorlagen/catalog.ts`).
 */
import { existsSync } from 'node:fs';
import path from 'node:path';

import { sharepicVorlagenContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import {
  canvasVorlageThumbFile,
  getCanvasVorlage,
  getPrintVorlage,
  getSharepicBlock,
  getSharepicSeite,
  getSharepicVorlage,
  listCanvasVorlagen,
  listFolienVorlagen,
  listPrintVorlagen,
  listSharepicBloecke,
  listSharepicSeiten,
  listSharepicVorlagen,
  printVorlageThumbFile,
  sharepicBlockThumbFile,
  sharepicSeiteThumbFile,
  sharepicVorlageAssetFile,
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
  folien: async ({ req, query }) => {
    getAuthedUser(req);
    const locale = await resolveVorlagenLocale(req, query.land);
    return { status: 200 as const, body: { vorlagen: listFolienVorlagen(locale) } };
  },
  canvas: async ({ req, query }) => {
    getAuthedUser(req);
    const locale = await resolveVorlagenLocale(req, query.land);
    return { status: 200 as const, body: { vorlagen: listCanvasVorlagen(locale) } };
  },
  print: async ({ req, query }) => {
    getAuthedUser(req);
    const locale = await resolveVorlagenLocale(req, query.land);
    return { status: 200 as const, body: { vorlagen: listPrintVorlagen(locale) } };
  },
  bloecke: async ({ req, query }) => {
    getAuthedUser(req);
    const locale = await resolveVorlagenLocale(req, query.land);
    return { status: 200 as const, body: { bloecke: listSharepicBloecke(locale) } };
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

function sendCanvasThumb(req: Request, res: Response): void {
  const id = String(req.params.id);
  sendThumbFile(req, res, canvasVorlageThumbFile(id), getCanvasVorlage(id)?.thumbVersion);
}

function sendPrintThumb(req: Request, res: Response): void {
  const id = String(req.params.id);
  sendThumbFile(
    req,
    res,
    printVorlageThumbFile(id, Number(req.query.seite ?? 1)),
    getPrintVorlage(id)?.thumbVersion
  );
}

function sendBlockThumb(req: Request, res: Response): void {
  const id = String(req.params.id);
  sendThumbFile(req, res, sharepicBlockThumbFile(id), getSharepicBlock(id)?.thumbVersion);
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

const ASSET_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

/**
 * A photo a Vorlage ships (`vorlage:<file>`). Copies of the Vorlage keep the
 * URL, so a file is never replaced in place: a new photo gets a new name.
 */
function sendAsset(req: Request, res: Response): void {
  const file = sharepicVorlageAssetFile(String(req.params.file));
  if (!file) {
    res.status(404).json({ error: 'Kein Bild.' });
    return;
  }
  res.setHeader('Cache-Control', 'private, max-age=604800');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.type(ASSET_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream');
  res.sendFile(file);
}

/** Mount after `requireAuth` on `/api/sharepic-vorlagen`. */
export function mountSharepicVorlagenRouter(app: Application): void {
  app.get('/api/sharepic-vorlagen/assets/:file', sendAsset);
  app.get('/api/sharepic-vorlagen/:id/thumb', sendThumb);
  app.get('/api/sharepic-vorlagen/seiten/:id/thumb', sendSeiteThumb);
  app.get('/api/sharepic-vorlagen/canvas/:id/thumb', sendCanvasThumb);
  app.get('/api/sharepic-vorlagen/print/:id/thumb', sendPrintThumb);
  app.get('/api/sharepic-vorlagen/bloecke/:id/thumb', sendBlockThumb);
  createExpressEndpoints(sharepicVorlagenContract, sharepicVorlagenContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'sharepicVorlagenContract'),
  });
}
