import { createHash } from 'node:crypto';

import { checkSiteHandle, type PublishedSiteSnapshot } from '@gruenerator/contracts';
import {
  renderSitePage,
  sitePaths,
  type RenderSitePageInput,
} from '@gruenerator/sites-design/server';
import { type ErrorRequestHandler, type RequestHandler, type Response, Router } from 'express';

import { createLogger } from '../../../utils/logger.js';
import { stockImageHandler } from '../../image/stockImage.js';

import { siteFontUrl, type SiteAssets } from './siteAssets.js';
import { SITE_BARE_CSP, siteCsp } from './siteSecurity.js';

const log = createLogger('sitePages');

const ASSET_PATTERN = /^(site)\.([0-9a-f]{12})\.css$|^(consent)\.([0-9a-f]{12})\.js$/;
const NOT_FOUND_HTML =
  '<!DOCTYPE html><html lang="de"><meta charset="utf-8"><title>Nicht gefunden</title><p>Diese Website gibt es nicht.</p></html>';

type SiteDocument = RenderSitePageInput['document'];

export interface SitePagesOptions {
  assets: SiteAssets;
  reportEmail: string;
  robots: 'index' | 'noindex';
  loadSnapshot: (handle: string) => Promise<PublishedSiteSnapshot | null>;
}

export function sendSiteNotFound(res: Response): void {
  res
    .status(404)
    .set({
      'Cache-Control': 'no-store',
      'Content-Security-Policy': SITE_BARE_CSP,
      'Content-Type': 'text/html; charset=utf-8',
    })
    .send(NOT_FOUND_HTML);
}

export function createSitePagesRouter(options: SitePagesOptions): Router {
  const { assets, reportEmail, robots, loadSnapshot } = options;
  const router = Router();

  router.use((_req, res, next) => {
    res.set('Content-Security-Policy', SITE_BARE_CSP);
    next();
  });

  router.get('/robots.txt', (_req, res) => {
    res.set('Content-Type', 'text/plain; charset=utf-8').send('User-agent: *\nAllow: /\n');
  });

  router.get('/_site/fonts/:file', (req, res) => {
    const path = assets.fontPath(req.params.file);
    if (!path) {
      sendSiteNotFound(res);
      return;
    }
    res.set('Cache-Control', 'public, max-age=604800');
    res.sendFile(path, { cacheControl: false }, (err) => {
      if (err && !res.headersSent) sendSiteNotFound(res);
    });
  });

  router.get('/_site/:asset', (req, res) => {
    const match = ASSET_PATTERN.exec(req.params.asset);
    if (!match) {
      sendSiteNotFound(res);
      return;
    }
    const asset = match[1] ? assets.stylesheet : assets.consent;
    const version = match[2] ?? match[4];
    res
      .set({
        'Cache-Control':
          version === asset.version ? 'public, max-age=31536000, immutable' : 'public, max-age=60',
        'Content-Type': asset.contentType,
      })
      .send(asset.body);
  });

  router.get('/api/image-picker/stock-image/:filename', stockImageHandler({ allowLive: false }));

  const page =
    (document: SiteDocument): RequestHandler =>
    async (req, res) => {
      const raw = req.params.handle as string;
      const checked = checkSiteHandle(raw);
      if (!checked.ok) {
        sendSiteNotFound(res);
        return;
      }
      const { handle } = checked;
      if (handle !== raw) {
        res.redirect(301, sitePaths(handle)[document]);
        return;
      }
      const snapshot = await loadSnapshot(handle);
      if (!snapshot) {
        sendSiteNotFound(res);
        return;
      }
      const { html } = renderSitePage({
        snapshot,
        handle,
        document,
        origin: `${req.protocol}://${req.host}`,
        stylesheetHref: assets.stylesheet.href,
        fontUrl: siteFontUrl,
        consentScriptSrc: assets.consent.href,
        reportEmail,
        robots,
      });
      const etag = createHash('sha256').update(html).digest('base64url').slice(0, 27);
      res.set({
        'Content-Security-Policy': siteCsp(assets.styleHash(snapshot.locale)),
        'Cache-Control': 'public, max-age=60, must-revalidate',
        ETag: `"${etag}"`,
      });
      if (req.fresh) {
        res.status(304).end();
        return;
      }
      res.status(200).set('Content-Type', 'text/html; charset=utf-8').send(html);
    };

  router.get('/:handle', page('home'));
  router.get('/:handle/impressum', page('impressum'));
  router.get('/:handle/datenschutz', page('datenschutz'));

  router.use((_req, res) => sendSiteNotFound(res));

  const onError: ErrorRequestHandler = (err: unknown, req, res, _next) => {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    // The router rejects a malformed percent-encoding with a 400 before any handler runs.
    const status = (err as { status?: unknown } | null)?.status;
    if (status === 400) {
      sendSiteNotFound(res);
      return;
    }
    log.error(`site page ${req.path} failed:`, err);
    res
      .status(500)
      .set({
        'Cache-Control': 'no-store',
        'Content-Security-Policy': SITE_BARE_CSP,
        'Content-Type': 'text/plain; charset=utf-8',
      })
      .send('Die Website ist gerade nicht erreichbar.');
  };
  router.use(onError);

  return router;
}
