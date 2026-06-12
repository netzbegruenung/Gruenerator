/**
 * ts-rest contract router for the /api/sites CRUD surface.
 *
 * Covers (see packages/contracts/src/contracts/sitesContract.ts):
 *   GET    /api/sites/my-site
 *   POST   /api/sites/create
 *   PUT    /api/sites/:id
 *   POST   /api/sites/:id/publish
 *   GET    /api/sites/check-subdomain
 *   DELETE /api/sites/:id
 *
 * Mount BEFORE the legacy sitesController in routes.ts so ts-rest matches its
 * own routes first; /public/:subdomain, /themes and the flyer/AI generation
 * endpoints fall through to the legacy routers.
 *
 * Authentication: routes.ts applies requireAuth for /api/sites (path-filtered
 * to keep /public/* anonymous) before this router is mounted, so req.user is
 * populated here. getUserId() still guards against a missing user.
 */
import { sitesContract, type Site } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { type UserSiteRow } from '../../database/schema/sites.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { createLogger } from '../../utils/logger.js';

import { RESERVED_SUBDOMAINS } from './types.js';

import type { UserProfile } from '../../services/user/types.js';
import type { Application, Request } from 'express';

const log = createLogger('sitesContract');
const db = getPostgresInstance();

function getUserId(req: Request): string | undefined {
  return (req.user as UserProfile | undefined)?.id;
}

/**
 * Boundary cast DB row → contract shape: the sections jsonb stores the object
 * form the contract codifies, and Date columns serialize to ISO strings via
 * res.json. The cast is the single assertion of that mapping.
 */
function toSiteBody(row: UserSiteRow): Site {
  return row as unknown as Site;
}

const ALLOWED_UPDATE_FIELDS = [
  'site_title',
  'tagline',
  'contact_email',
  'social_links',
  'accent_color',
  'profile_image',
  'background_image',
  'sections',
  'meta_description',
  'meta_keywords',
] as const;

const s = initServer();

export const sitesContractRouter = s.router(sitesContract, {
  getMySite: async ({ req }) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return { status: 401 as const, body: { error: 'Nicht authentifiziert' } };
      }

      const result = await db.query<UserSiteRow>('SELECT * FROM user_sites WHERE user_id = $1', [
        userId,
      ]);

      const row = result?.[0];
      return { status: 200 as const, body: { site: row ? toSiteBody(row) : null } };
    } catch (error) {
      log.error('Error fetching user site:', error);
      return { status: 500 as const, body: { error: 'Fehler beim Laden der Site' } };
    }
  },

  createSite: async ({ req, body }) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return { status: 401 as const, body: { error: 'Nicht authentifiziert' } };
      }

      const {
        subdomain,
        site_title,
        tagline,
        theme = 'gruene',
        contact_email,
        social_links,
        profile_image,
        background_image,
        sections,
      } = body;

      const subdomainLower = subdomain.toLowerCase().trim();
      if (!/^[a-z0-9-]+$/.test(subdomainLower)) {
        return {
          status: 400 as const,
          body: { error: 'Subdomain darf nur Kleinbuchstaben, Zahlen und Bindestriche enthalten' },
        };
      }

      if (RESERVED_SUBDOMAINS.includes(subdomainLower)) {
        return { status: 400 as const, body: { error: 'Diese Subdomain ist reserviert' } };
      }

      const existingCheck = await db.query<Pick<UserSiteRow, 'id'>>(
        'SELECT id FROM user_sites WHERE user_id = $1',
        [userId]
      );

      if (existingCheck && existingCheck.length > 0) {
        return { status: 400 as const, body: { error: 'Sie haben bereits eine Site erstellt' } };
      }

      const result = await db.query<UserSiteRow>(
        `INSERT INTO user_sites (
           user_id, subdomain, site_title, tagline, theme, is_published,
           contact_email, social_links, profile_image, background_image, sections
         )
         VALUES ($1, $2, $3, $4, $5, false, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          userId,
          subdomainLower,
          site_title,
          tagline ?? null,
          theme,
          contact_email ?? null,
          social_links ? JSON.stringify(social_links) : null,
          profile_image ?? null,
          background_image ?? null,
          sections ? JSON.stringify(sections) : null,
        ]
      );

      const row = result?.[0];
      if (!row) {
        return { status: 500 as const, body: { error: 'Fehler beim Erstellen der Site' } };
      }
      return { status: 200 as const, body: { site: toSiteBody(row) } };
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        'code' in error &&
        (error as { code: string }).code === '23505'
      ) {
        return { status: 400 as const, body: { error: 'Diese Subdomain ist bereits vergeben' } };
      }
      log.error('Error creating site:', error);
      return { status: 500 as const, body: { error: 'Fehler beim Erstellen der Site' } };
    }
  },

  updateSite: async ({ req, params, body }) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return { status: 401 as const, body: { error: 'Nicht authentifiziert' } };
      }

      const updateFields: string[] = [];
      const values: unknown[] = [];
      let paramCounter = 1;

      for (const field of ALLOWED_UPDATE_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(body, field)) {
          updateFields.push(`${field} = $${paramCounter}`);
          values.push(body[field]);
          paramCounter++;
        }
      }

      if (updateFields.length === 0) {
        return { status: 400 as const, body: { error: 'Keine Felder zum Aktualisieren' } };
      }

      values.push(params.id, userId);

      const result = await db.query<UserSiteRow>(
        `UPDATE user_sites
         SET ${updateFields.join(', ')}
         WHERE id = $${paramCounter} AND user_id = $${paramCounter + 1}
         RETURNING *`,
        values
      );

      const row = result?.[0];
      if (!row) {
        return { status: 404 as const, body: { error: 'Site nicht gefunden' } };
      }
      return { status: 200 as const, body: { site: toSiteBody(row) } };
    } catch (error) {
      log.error('Error updating site:', error);
      return { status: 500 as const, body: { error: 'Fehler beim Aktualisieren der Site' } };
    }
  },

  publishSite: async ({ req, params, body }) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return { status: 401 as const, body: { error: 'Nicht authentifiziert' } };
      }

      const result = await db.query<UserSiteRow>(
        `UPDATE user_sites
         SET is_published = $1, last_published = CASE WHEN $1 = true THEN CURRENT_TIMESTAMP ELSE last_published END
         WHERE id = $2 AND user_id = $3
         RETURNING *`,
        [body.publish, params.id, userId]
      );

      const row = result?.[0];
      if (!row) {
        return { status: 404 as const, body: { error: 'Site nicht gefunden' } };
      }
      return { status: 200 as const, body: { site: toSiteBody(row) } };
    } catch (error) {
      log.error('Error publishing site:', error);
      return { status: 500 as const, body: { error: 'Fehler beim Veröffentlichen der Site' } };
    }
  },

  checkSubdomain: async ({ query }) => {
    try {
      const subdomainLower = query.subdomain.toLowerCase().trim();

      if (!/^[a-z0-9-]+$/.test(subdomainLower)) {
        return { status: 200 as const, body: { available: false, reason: 'invalid' as const } };
      }

      if (RESERVED_SUBDOMAINS.includes(subdomainLower)) {
        return { status: 200 as const, body: { available: false, reason: 'reserved' as const } };
      }

      const result = await db.query<Pick<UserSiteRow, 'id'>>(
        'SELECT id FROM user_sites WHERE subdomain = $1',
        [subdomainLower]
      );

      return { status: 200 as const, body: { available: !result || result.length === 0 } };
    } catch (error) {
      log.error('Error checking subdomain:', error);
      return { status: 500 as const, body: { error: 'Fehler beim Prüfen der Subdomain' } };
    }
  },

  deleteSite: async ({ req, params }) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return { status: 401 as const, body: { error: 'Nicht authentifiziert' } };
      }

      const result = await db.query<Pick<UserSiteRow, 'id'>>(
        'DELETE FROM user_sites WHERE id = $1 AND user_id = $2 RETURNING id',
        [params.id, userId]
      );

      if (!result || result.length === 0) {
        return { status: 404 as const, body: { error: 'Site nicht gefunden' } };
      }

      return { status: 200 as const, body: { success: true } };
    } catch (error) {
      log.error('Error deleting site:', error);
      return { status: 500 as const, body: { error: 'Fehler beim Löschen der Site' } };
    }
  },
});

export function mountSitesContractRouter(app: Application): void {
  createExpressEndpoints(sitesContract, sitesContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'sitesContract'),
  });
}
