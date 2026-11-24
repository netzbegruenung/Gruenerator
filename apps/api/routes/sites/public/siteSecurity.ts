import { createHash } from 'node:crypto';

import { type RequestHandler } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import helmet from 'helmet';

export const SITE_ROBOTS: 'index' | 'noindex' = 'noindex';

export function cspHash(text: string): string {
  return `'sha256-${createHash('sha256').update(text).digest('base64')}'`;
}

export function siteCsp(styleHash: string): string {
  return `default-src 'none'; script-src 'self'; style-src 'self' ${styleHash}; img-src 'self'; font-src 'self'; frame-src https://www.instagram.com; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;
}

export const SITE_BARE_CSP =
  "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

// The bare CSP is the baseline; a rendered page replaces it per response, because its style hash
// depends on the site's locale.
export const siteHelmet: RequestHandler = helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'none'"],
      baseUri: ["'none'"],
      formAction: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginResourcePolicy: { policy: 'same-origin' },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
});

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
