/**
 * ts-rest contract router for the /api/sites CRUD surface.
 *
 * Covers (see packages/contracts/src/contracts/sitesContract.ts):
 *   GET    /api/sites/my-site
 *   POST   /api/sites/create
 *   PUT    /api/sites/:id
 *   POST   /api/sites/:id/publish
 *   POST   /api/sites/:id/draft
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
import {
  buildSiteSnapshot,
  checkSiteHandle,
  DEFAULT_SITE_VARIANT,
  siteDraftFromSite,
  siteDraftToRowColumns,
  siteDraftToSnapshotSource,
  sitesContract,
  type SiteDraft,
} from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';
import { sql } from 'drizzle-orm';

import { env } from '../../config/env.js';
import { getServerConfig } from '../../config/serverConfig.js';
import { siteOrigin } from '../../config/sitesOrigin.js';
import { type UserSiteRow } from '../../database/schema/sites.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { closeCollabRooms } from '../../services/collab/hocuspocusInternal.js';
import { ensureSiteDraft, readSiteDraft, siteRoom } from '../../services/sites/siteDraftDoc.js';
import { toSite } from '../../services/sites/siteMapper.js';
import { USER_SITE_TRASH } from '../../services/sites/userSiteTrash.js';
import { isUniqueViolation, trashOwnedRow } from '../../services/trash/ownedRowTrash.js';
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
  'theme',
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

/**
 * An address change runs through Drizzle, because PostgresService strips the pg code. It lands
 * only while the site was never published (`last_published IS NULL`), in the same statement.
 */
async function updateSiteWithAddress(
  userId: string,
  id: string,
  subdomain: string,
  body: Partial<Record<(typeof ALLOWED_UPDATE_FIELDS)[number], unknown>>
) {
  const handle = checkSiteHandle(subdomain);
  if (!handle.ok) {
    return { status: 400 as const, body: { error: HANDLE_MESSAGES[handle.reason] } };
  }

  const assignments = [sql`subdomain = ${handle.handle}`];
  for (const field of ALLOWED_UPDATE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      assignments.push(sql`${sql.identifier(field)} = ${sql.param(body[field])}`);
    }
  }

  let row: UserSiteRow | undefined;
  try {
    const result = await getDrizzleInstance().execute<UserSiteRow>(
      sql`UPDATE user_sites
          SET ${sql.join(assignments, sql`, `)}
          WHERE id = ${id} AND user_id = ${userId} AND deleted_at IS NULL
            AND last_published IS NULL
          RETURNING *`
    );
    row = result.rows[0];
  } catch (error: unknown) {
    if (isUniqueViolation(error)) {
      return { status: 400 as const, body: { error: 'Diese Adresse ist bereits vergeben' } };
    }
    throw error;
  }
  if (row) return { status: 200 as const, body: { site: toSite(row) } };

  const existing = await db.query<Pick<UserSiteRow, 'id'>>(
    'SELECT id FROM user_sites WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
    [id, userId]
  );
  if (existing && existing.length > 0) {
    return {
      status: 400 as const,
      body: {
        error: 'Die Adresse kann nach dem ersten Veröffentlichen nicht mehr geändert werden',
      },
    };
  }
  return { status: 404 as const, body: { error: 'Website nicht gefunden' } };
}

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
      const publicOrigin = env.SITES_HOST
        ? siteOrigin(env.SITES_HOST, getServerConfig().port)
        : null;
      return {
        status: 200 as const,
        body: { site: row ? toSite(row) : null, public_origin: publicOrigin },
      };
    } catch (error) {
      log.error('Error fetching user site:', error);
      return { status: 500 as const, body: { error: 'Fehler beim Laden der Website' } };
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
        theme = DEFAULT_SITE_VARIANT,
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

      // Drizzle, not `db.query`: PostgresService strips the pg code and constraint.
      const result = await getDrizzleInstance().execute<UserSiteRow>(
        sql`INSERT INTO user_sites (
              user_id, subdomain, site_title, tagline, theme, is_published,
              contact_email, contact_phone, social_links, profile_image, background_image,
              sections, legal
            )
            VALUES (
              ${userId}, ${handle.handle}, ${site_title}, ${tagline ?? null}, ${theme}, false,
              ${contact_email ?? null}, ${contact_phone ?? null},
              ${social_links ? JSON.stringify(social_links) : null}, ${profile_image ?? null},
              ${background_image ?? null}, ${sections ? JSON.stringify(sections) : null},
              ${legal ? JSON.stringify(legal) : null}
            )
            RETURNING *`
      );

      const row = result.rows[0];
      if (!row) {
        return { status: 500 as const, body: { error: 'Fehler beim Erstellen der Website' } };
      }
      return { status: 200 as const, body: { site: toSite(row) } };
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        const constraint = (error as { cause?: { constraint?: unknown } }).cause?.constraint;
        const message =
          constraint === 'user_sites_one_live_per_user'
            ? 'Du hast bereits eine Website erstellt'
            : 'Diese Adresse ist bereits vergeben';
        return { status: 400 as const, body: { error: message } };
      }
      log.error('Error creating site:', error);
      return { status: 500 as const, body: { error: 'Fehler beim Erstellen der Website' } };
    }
  },

  updateSite: async ({ req, params, body }) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return { status: 401 as const, body: { error: 'Nicht authentifiziert' } };
      }

      // The content fields stay accepted (F0). Once the draft is seeded, the next publish
      // overwrites them from the Y.Doc.
      if (body.subdomain !== undefined) {
        return await updateSiteWithAddress(userId, params.id, body.subdomain, body);
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
        return { status: 404 as const, body: { error: 'Website nicht gefunden' } };
      }
      return { status: 200 as const, body: { site: toSite(row) } };
    } catch (error) {
      log.error('Error updating site:', error);
      return { status: 500 as const, body: { error: 'Fehler beim Aktualisieren der Website' } };
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
        const owned = current?.[0];
        if (!owned) {
          return { status: 404 as const, body: { error: 'Website nicht gefunden' } };
        }
        let yjsDraft: SiteDraft | null;
        try {
          yjsDraft = await readSiteDraft(owned.id);
        } catch (error) {
          log.error(`Reading the draft of ${siteRoom(owned.id)} for publish failed:`, error);
          return {
            status: 503 as const,
            body: { error: 'Der Entwurf konnte nicht gelesen werden' },
          };
        }
        const site = toSite(owned);
        const draft = yjsDraft ?? siteDraftFromSite(site);
        const built = buildSiteSnapshot(
          siteDraftToSnapshotSource(draft, site.legal),
          getUserLocale(req)
        );
        if (!built.ok) {
          return {
            status: 422 as const,
            body: {
              error: 'Die Website kann noch nicht veröffentlicht werden',
              issues: built.issues,
            },
          };
        }
        const columns = siteDraftToRowColumns(draft);
        result = await db.query<UserSiteRow>(
          `UPDATE user_sites
           SET site_title = $1, tagline = $2, profile_image = $3, theme = $4,
               contact_email = $5, contact_phone = $6, social_links = $7, sections = $8,
               published_snapshot = $9, is_published = true, last_published = CURRENT_TIMESTAMP
           WHERE id = $10 AND user_id = $11 AND deleted_at IS NULL
           RETURNING *`,
          [
            columns.site_title,
            columns.tagline,
            columns.profile_image,
            columns.theme,
            columns.contact_email,
            columns.contact_phone,
            JSON.stringify(columns.social_links),
            JSON.stringify(columns.sections),
            JSON.stringify(built.snapshot),
            params.id,
            userId,
          ]
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
      return { status: 500 as const, body: { error: 'Fehler beim Veröffentlichen der Website' } };
    }
  },

  prepareSiteDraft: async ({ req, params }) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return { status: 401 as const, body: { error: 'Nicht authentifiziert' } };
      }

      const result = await db.query<UserSiteRow>(
        'SELECT * FROM user_sites WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
        [params.id, userId]
      );
      const row = result?.[0];
      if (!row) {
        return { status: 404 as const, body: { error: 'Website nicht gefunden' } };
      }

      // Seeded before the answer, so no editor ever connects to an empty room.
      try {
        return { status: 200 as const, body: await ensureSiteDraft(toSite(row)) };
      } catch (error) {
        log.error(`Preparing the draft of ${siteRoom(row.id)} failed:`, error);
        return { status: 503 as const, body: { error: 'Der Entwurf ist gerade nicht erreichbar' } };
      }
    } catch (error) {
      log.error('Error preparing site draft:', error);
      return { status: 500 as const, body: { error: 'Fehler beim Laden der Website' } };
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
      return { status: 500 as const, body: { error: 'Fehler beim Prüfen der Adresse' } };
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
        return { status: 404 as const, body: { error: 'Website nicht gefunden' } };
      }

      void closeCollabRooms([siteRoom(params.id)]);
      return { status: 200 as const, body: { success: true } };
    } catch (error) {
      log.error('Error deleting site:', error);
      return { status: 500 as const, body: { error: 'Fehler beim Löschen der Website' } };
    }
  },
});

export function mountSitesContractRouter(app: Application): void {
  createExpressEndpoints(sitesContract, sitesContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'sitesContract'),
  });
}
