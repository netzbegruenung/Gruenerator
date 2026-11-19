import { createHash } from 'node:crypto';

import { type RequestHandler } from 'express';
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

// The CSP is set per response: the style hash depends on the site's locale.
export const siteHelmet: RequestHandler = helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'same-origin' },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
});
