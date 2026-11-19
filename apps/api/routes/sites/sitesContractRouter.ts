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
 * The flyer upload (POST /api/sites/generate-from-flyer) has its own router,
 * mounted ahead of this one in routes.ts.
 *
 * Authentication: routes.ts applies requireAuth for /api/sites before this
 * router is mounted, so req.user is populated here. getUserId() still guards
 * against a missing user.
 */
import { buildSiteSnapshot, checkSiteHandle, sitesContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { type UserSiteRow } from '../../database/schema/sites.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { toSite } from '../../services/sites/siteMapper.js';
import { USER_SITE_TRASH } from '../../services/sites/userSiteTrash.js';
import { trashOwnedRow } from '../../services/trash/ownedRowTrash.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { createLogger } from '../../utils/logger.js';

import { getUserLocale } from '../auth/groups/groupsContract/shared.js';

import type { UserProfile } from '../../services/user/types.js';
import type { Application, Request } from 'express';

const log = createLogger('sitesContract');
const db = getPostgresInstance();

function getUserId(req: Request): string | undefined {
  return (req.user as UserProfile | undefined)?.id;
}

const HANDLE_MESSAGES = {
  invalid:
    'Die Adresse darf nur Kleinbuchstaben, Zahlen und Bindestriche enthalten und muss 3 bis 30 Zeichen lang sein',
  reserved: 'Diese Adresse ist reserviert',
} as const;

const ALLOWED_UPDATE_FIELDS = [
  'site_title',
  'tagline',
  'contact_email',
  'contact_phone',
  'social_links',
  'accent_color',
  'profile_image',
  'background_image',
  'sections',
  'legal',
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

      const result = await db.query<UserSiteRow>(
        'SELECT * FROM user_sites WHERE user_id = $1 AND deleted_at IS NULL',
        [userId]
      );

      const row = result?.[0];
      return { status: 200 as const, body: { site: row ? toSite(row) : null } };
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
        contact_phone,
        social_links,
        profile_image,
        background_image,
        sections,
        legal,
      } = body;

      const handle = checkSiteHandle(subdomain);
      if (!handle.ok) {
        return { status: 400 as const, body: { error: HANDLE_MESSAGES[handle.reason] } };
      }

      const existingCheck = await db.query<Pick<UserSiteRow, 'id'>>(
        'SELECT id FROM user_sites WHERE user_id = $1 AND deleted_at IS NULL',
        [userId]
      );

      if (existingCheck && existingCheck.length > 0) {
        return { status: 400 as const, body: { error: 'Du hast bereits eine Website erstellt' } };
      }

      const result = await db.query<UserSiteRow>(
        `INSERT INTO user_sites (
           user_id, subdomain, site_title, tagline, theme, is_published,
           contact_email, contact_phone, social_links, profile_image, background_image,
           sections, legal
         )
         VALUES ($1, $2, $3, $4, $5, false, $6, $7, $8, $9, $10, $11, $12)
         RETURNING *`,
        [
          userId,
          handle.handle,
          site_title,
          tagline ?? null,
          theme,
          contact_email ?? null,
          contact_phone ?? null,
          social_links ? JSON.stringify(social_links) : null,
          profile_image ?? null,
          background_image ?? null,
          sections ? JSON.stringify(sections) : null,
          legal ? JSON.stringify(legal) : null,
        ]
      );

      const row = result?.[0];
      if (!row) {
        return { status: 500 as const, body: { error: 'Fehler beim Erstellen der Site' } };
      }
      return { status: 200 as const, body: { site: toSite(row) } };
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        'code' in error &&
        (error as { code: string }).code === '23505'
      ) {
        const constraint =
          'constraint' in error ? (error as { constraint: unknown }).constraint : null;
        const message =
          constraint === 'user_sites_one_live_per_user'
            ? 'Du hast bereits eine Website erstellt'
            : 'Diese Adresse ist bereits vergeben';
        return { status: 400 as const, body: { error: message } };
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
         WHERE id = $${paramCounter} AND user_id = $${paramCounter + 1} AND deleted_at IS NULL
         RETURNING *`,
        values
      );

      const row = result?.[0];
      if (!row) {
        return { status: 404 as const, body: { error: 'Site nicht gefunden' } };
      }
      return { status: 200 as const, body: { site: toSite(row) } };
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

      let result: UserSiteRow[] | null;
      if (body.publish) {
        const current = await db.query<UserSiteRow>(
          'SELECT * FROM user_sites WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
          [params.id, userId]
        );
        const draft = current?.[0];
        if (!draft) {
          return { status: 404 as const, body: { error: 'Website nicht gefunden' } };
        }
        const built = buildSiteSnapshot(toSite(draft), getUserLocale(req));
        if (!built.ok) {
          return {
            status: 422 as const,
            body: {
              error: 'Die Website kann noch nicht veröffentlicht werden',
              issues: built.issues,
            },
          };
        }
        result = await db.query<UserSiteRow>(
          `UPDATE user_sites
           SET published_snapshot = $1, is_published = true, last_published = CURRENT_TIMESTAMP
           WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL
           RETURNING *`,
          [JSON.stringify(built.snapshot), params.id, userId]
        );
      } else {
        result = await db.query<UserSiteRow>(
          `UPDATE user_sites
           SET is_published = false, published_snapshot = NULL
           WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
           RETURNING *`,
          [params.id, userId]
        );
      }

      const row = result?.[0];
      if (!row) {
        return { status: 404 as const, body: { error: 'Website nicht gefunden' } };
      }
      return { status: 200 as const, body: { site: toSite(row) } };
    } catch (error) {
      log.error('Error publishing site:', error);
      return { status: 500 as const, body: { error: 'Fehler beim Veröffentlichen der Site' } };
    }
  },

  checkSubdomain: async ({ query }) => {
    try {
      const handle = checkSiteHandle(query.subdomain);
      if (!handle.ok) {
        return { status: 200 as const, body: { available: false, reason: handle.reason } };
      }

      const result = await db.query<Pick<UserSiteRow, 'id'>>(
        'SELECT id FROM user_sites WHERE subdomain = $1 AND deleted_at IS NULL',
        [handle.handle]
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

      // Into the Papierkorb; someone else's site answers 404 as before.
      const result = await trashOwnedRow(USER_SITE_TRASH, userId, params.id);

      if (result !== 'ok') {
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
