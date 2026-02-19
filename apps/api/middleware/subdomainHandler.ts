/**
 * Subdomain Handler Middleware
 * Detects and handles user-specific subdomains for custom sites
 */

import { Request, type Response, type NextFunction } from 'express';

import { getPostgresInstance } from '../database/services/PostgresService.js';

import { type SubdomainRequest, type UserSiteData } from './types.js';

const db = getPostgresInstance();

/**
 * Extract subdomain from host header
 * Returns null for reserved subdomains (www, api, app, beta) or main domain
 */
export const getSubdomain = (host: string | undefined): string | null => {
  if (!host) {
    console.log('[SubdomainHandler] No host provided');
    return null;
  }

  console.log(`[SubdomainHandler] Processing host: ${host}`);
  const parts = host.split('.');

  if (parts.length >= 3) {
    const subdomain = parts[0];
    console.log(`[SubdomainHandler] Extracted subdomain: ${subdomain}`);

    if (subdomain !== 'www' && subdomain !== 'api' && subdomain !== 'app' && subdomain !== 'beta') {
      console.log(`[SubdomainHandler] ✓ Subdomain "${subdomain}" will be treated as user site`);
      return subdomain;
    } else {
      console.log(
        `[SubdomainHandler] ✗ Subdomain "${subdomain}" is reserved, treating as main app`
      );
    }
  } else {
    console.log(`[SubdomainHandler] Host has ${parts.length} parts, not a subdomain`);
  }

  return null;
};

/**
 * Middleware to handle subdomain-based user sites
 * Attaches subdomain and site data to request if found
 */
export const subdomainHandler = async (
  req: SubdomainRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const host = req.get('host');
    const subdomain = getSubdomain(host);

    if (subdomain) {
      console.log(`[SubdomainHandler] Looking up user site for subdomain: ${subdomain}`);
      req.subdomain = subdomain;

      const result = (await db.query(
        'SELECT * FROM user_sites WHERE subdomain = $1 AND is_published = true',
        [subdomain],
        { table: 'user_sites' }
      )) as unknown as UserSiteData[];

      if (result && result.length > 0) {
        console.log(`[SubdomainHandler] ✓ Found published site for subdomain: ${subdomain}`);
        req.siteData = result[0];

        await db.query(
          'UPDATE user_sites SET visit_count = visit_count + 1 WHERE id = $1',
          [result[0].id],
          { table: 'user_sites' }
        );
      } else {
        console.log(`[SubdomainHandler] ✗ No published site found for subdomain: ${subdomain}`);
      }
    }

    next();
  } catch (error) {
    console.error('[SubdomainHandler] Error:', error);
    next();
  }
};
