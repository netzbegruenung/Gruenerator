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
import { siteHelmet } from './siteSecurity.js';

const log = createLogger('sitesHostGate');

const PASSTHROUGH_PATH = /^\/api\/share\/[A-Za-z0-9_-]{6,128}\/preview$/;

export function isSitesPassthrough(method: string, path: string): boolean {
  return (method === 'GET' || method === 'HEAD') && PASSTHROUGH_PATH.test(path);
}

export const sitesReadLimiter: RequestHandler =
  process.env.DISABLE_RATE_LIMITS === 'true'
    ? (_req, _res, next) => next()
    : rateLimit({
        windowMs: 60 * 60 * 1000,
        max: 2000,
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: (req) => (req.ip ? ipKeyGenerator(req.ip) : 'anonymous'),
      });

export interface SitesHostGateOptions {
  host: string;
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

export function createSitesHostGate(options: SitesHostGateOptions): RequestHandler {
  const { host, pages, limiter, robots } = options;
  const wwwHost = `www.${host}`;

  const inner = Router();
  inner.use(siteHelmet, compression({ filter: shouldCompress, level: 6 }), limiter, pages);
  inner.use((_req: Request, res: Response) => sendSiteNotFound(res));
  const onError: ErrorRequestHandler = (err: unknown, req, res, _next) => {
    log.error(`sites host ${req.path} failed:`, err);
    sendSiteError(res);
  };
  inner.use(onError);

  return (req: Request, res: Response, next: NextFunction) => {
    const hostname = typeof req.hostname === 'string' ? req.hostname.toLowerCase() : '';
    if (hostname === wwwHost) {
      res.redirect(301, `${req.protocol}://${host}${req.originalUrl}`);
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
