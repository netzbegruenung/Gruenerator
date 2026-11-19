import compression from 'compression';
import {
  type ErrorRequestHandler,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
  Router,
} from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

import { shouldCompress } from '../../../middleware/compressionFilter.js';
import { createLogger } from '../../../utils/logger.js';

import { sendSiteNotFound } from './sitePages.js';
import { SITE_BARE_CSP, siteHelmet } from './siteSecurity.js';

const log = createLogger('sitesHostGate');

const PASSTHROUGH_PATH = /^\/api\/share\/[A-Za-z0-9_-]{6,128}\/preview$/;

export function isSitesPassthrough(method: string, path: string): boolean {
  return (method === 'GET' || method === 'HEAD') && PASSTHROUGH_PATH.test(path);
}

const PAGE_PATH = /^\/(?!_site(?:\/|$))[^/]+(?:\/(?:impressum|datenschutz))?\/?$/;
const UNLIMITED_PATHS = new Set(['/robots.txt', '/favicon.ico']);

export function isSitesPagePath(path: string): boolean {
  return PAGE_PATH.test(path) && !UNLIMITED_PATHS.has(path);
}

export function createSitesReadLimiter(max: number): RequestHandler {
  if (process.env.DISABLE_RATE_LIMITS === 'true') return (_req, _res, next) => next();
  return rateLimit({
    windowMs: 60 * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => (req.ip ? ipKeyGenerator(req.ip) : 'anonymous'),
    handler: (_req, res) => {
      res
        .status(429)
        .set({
          'Cache-Control': 'no-store',
          'Content-Security-Policy': SITE_BARE_CSP,
          'Content-Type': 'text/plain; charset=utf-8',
        })
        .send('Zu viele Anfragen. Bitte versuche es in einigen Minuten noch einmal.');
    },
  });
}

export const sitesReadLimiter: RequestHandler = createSitesReadLimiter(2000);

export interface SitesHostGateOptions {
  host: string;
  origin: string;
  pages: Router;
  limiter: RequestHandler;
  robots: 'index' | 'noindex';
}

function sendSiteError(res: Response): void {
  if (res.headersSent) {
    res.destroy();
    return;
  }
  res
    .status(500)
    .set({ 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' })
    .send('Die Website ist gerade nicht erreichbar.');
}

function requestHostname(req: Request): string {
  return typeof req.hostname === 'string' ? req.hostname.toLowerCase() : '';
}

export function createSitesUnavailableGate(host: string): RequestHandler {
  const wwwHost = `www.${host}`;
  return (req: Request, res: Response, next: NextFunction) => {
    const hostname = requestHostname(req);
    if (hostname !== host && hostname !== wwwHost) {
      next();
      return;
    }
    sendSiteNotFound(res);
  };
}

export function createSitesHostGate(options: SitesHostGateOptions): RequestHandler {
  const { host, origin, pages, limiter, robots } = options;
  const wwwHost = `www.${host}`;

  const inner = Router();
  const pageLimiter: RequestHandler = (req, res, next) => {
    if (isSitesPagePath(req.path)) limiter(req, res, next);
    else next();
  };
  inner.use(siteHelmet, compression({ filter: shouldCompress, level: 6 }), pageLimiter, pages);
  inner.use((_req: Request, res: Response) => sendSiteNotFound(res));
  const onError: ErrorRequestHandler = (err: unknown, req, res, _next) => {
    log.error(`sites host ${req.path} failed:`, err);
    sendSiteError(res);
  };
  inner.use(onError);

  return (req: Request, res: Response, next: NextFunction) => {
    const hostname = requestHostname(req);
    if (hostname === wwwHost) {
      res.redirect(301, `${origin}${req.originalUrl}`);
      return;
    }
    if (hostname !== host) {
      next();
      return;
    }
    if (robots === 'noindex') res.set('X-Robots-Tag', 'noindex, nofollow');
    if (isSitesPassthrough(req.method, req.path)) {
      next();
      return;
    }
    inner(req, res, (err?: unknown) => {
      if (err) {
        log.error(`sites host ${req.path} failed:`, err);
        sendSiteError(res);
        return;
      }
      sendSiteNotFound(res);
    });
  };
}
