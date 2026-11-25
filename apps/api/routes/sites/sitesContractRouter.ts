/**
 * ts-rest contract router for the /api/sites CRUD surface.
 *
 * Every route authorizes by the caller's role on the site (services/sites/siteAccess.ts); only
 * create is gated by the Sites unlock (routes.ts).
 *
 * Covers (see packages/contracts/src/contracts/sitesContract.ts):
 *   GET    /api/sites
 *   GET    /api/sites/by-handle/:handle
 *   GET    /api/sites/my-site (deprecated)
 *   POST   /api/sites/create
 *   PUT    /api/sites/:id
 *   POST   /api/sites/:id/publish
 *   POST   /api/sites/:id/draft
 *   GET    /api/sites/check-subdomain
 *   DELETE /api/sites/:id
 *   GET    /api/sites/:id/members, PUT|DELETE /api/sites/:id/members/:userId
 *   GET    /api/sites/:id/groups, PUT|DELETE /api/sites/:id/groups/:groupId
 *   POST   /api/sites/generate (SSE, see siteGenerationRoute.ts)
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
  SITES_PER_ACCOUNT_MAX,
  type SiteListItem,
  type SiteRole,
  sitesContract,
  updateUserSiteBodySchema,
  type SiteDraft,
} from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';
import { sql } from 'drizzle-orm';

import { env } from '../../config/env.js';
import { getServerConfig } from '../../config/serverConfig.js';
import { siteOrigin } from '../../config/sitesOrigin.js';
import { type UserSiteRawRow, type UserSiteRow } from '../../database/schema/sites.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import {
  addGroupShare,
  GroupShareForbiddenError,
  removeGroupShare,
} from '../../services/groups/groupShareWriter.js';
import { resolvePublishLocale } from '../../services/sites/publishLocale.js';
import { getSiteRole, requireSiteRole } from '../../services/sites/siteAccess.js';
import { ensureSiteDraft, readSiteDraft, siteRoom } from '../../services/sites/siteDraftDoc.js';
import { toSite } from '../../services/sites/siteMapper.js';
import {
  listSiteMembers,
  removeSiteMember,
  setSiteMemberRole,
} from '../../services/sites/siteMembers.js';
import {
  siteAccountLockKey,
  siteGroupLockKey,
  trashUserSite,
} from '../../services/sites/userSiteTrash.js';
import { isRowId, isUniqueViolation } from '../../services/trash/ownedRowTrash.js';
import { isUserSitesEntitled } from '../../services/user/sitesEntitlement.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { createLogger } from '../../utils/logger.js';

import { generateSiteContentRoute } from './siteGenerationRoute.js';

import type { UserProfile } from '../../services/user/types.js';
import type { Application, Request } from 'express';

const log = createLogger('sitesContract');
const db = getPostgresInstance();

function getUserId(req: Request): string | undefined {
  return (req.user as UserProfile | undefined)?.id;
}

/** A role below the one a route needs answers 403; no role at all answers 404 (no existence leak). */
function denied(result: 'not_found' | 'forbidden') {
  return result === 'forbidden'
    ? { status: 403 as const, body: { error: 'Dafür fehlt dir die Berechtigung' } }
    : { status: 404 as const, body: { error: 'Website nicht gefunden' } };
}

const UNAUTHENTICATED = { status: 401 as const, body: { error: 'Nicht authentifiziert' } };
const NOT_PERSONAL = {
  status: 409 as const,
  body: {
    error: 'Eine Projekt-Website gehört dem Projekt und wird nicht geteilt',
    code: 'not_personal' as const,
  },
};

function publicOrigin(): string | null {
  return env.SITES_HOST ? siteOrigin(env.SITES_HOST, getServerConfig().port) : null;
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

  let row: UserSiteRawRow | undefined;
  try {
    const result = await getDrizzleInstance().execute<UserSiteRawRow>(
      sql`UPDATE user_sites
          SET ${sql.join(assignments, sql`, `)}
          WHERE id = ${id} AND deleted_at IS NULL
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
    'SELECT id FROM user_sites WHERE id = $1 AND deleted_at IS NULL',
    [id]
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

const PUBLISH_ROW_COLUMNS = updateUserSiteBodySchema
  .pick({
    site_title: true,
    tagline: true,
    profile_image: true,
    theme: true,
    contact_email: true,
    contact_phone: true,
    social_links: true,
    sections: true,
  })
  .required();

const s = initServer();

export const sitesContractRouter = s.router(sitesContract, {
  generateSiteContent: generateSiteContentRoute,

  listSites: async ({ req }) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return { status: 401 as const, body: { error: 'Nicht authentifiziert' } };
      }

      // Candidates are every site the person could touch (own, member, project, shared); the
      // role itself comes from the one resolver, so a stale creator or a removed member drops out.
      const rows = await db.query<UserSiteRow & { group_name: string | null }>(
        `SELECT us.*, g.name AS group_name
           FROM user_sites us
           LEFT JOIN groups g ON g.id = us.group_id AND g.deleted_at IS NULL
          WHERE us.deleted_at IS NULL AND (
                us.user_id = $1
             OR EXISTS (SELECT 1 FROM site_members sm
                         WHERE sm.site_id = us.id AND sm.user_id = $1)
             OR us.group_id IN (SELECT gm.group_id FROM group_memberships gm
                                 WHERE gm.user_id = $1 AND gm.is_active = TRUE)
             OR EXISTS (SELECT 1 FROM group_content_shares gcs
                         INNER JOIN group_memberships gm
                                 ON gm.group_id = gcs.group_id AND gm.user_id = $1
                                AND gm.is_active = TRUE
                         WHERE gcs.content_type = 'user_sites' AND gcs.content_id = us.id::text
                           AND gcs.group_id IS NOT NULL))
          ORDER BY us.updated_at DESC, us.id`,
        [userId]
      );
      const roles = await Promise.all(rows.map((row) => getSiteRole(row.id, userId)));
      const sites: SiteListItem[] = [];
      rows.forEach((row, index) => {
        const role = roles[index];
        if (!role) return;
        const site = toSite(row);
        sites.push({
          id: site.id,
          subdomain: site.subdomain,
          site_title: site.site_title,
          is_published: site.is_published,
          last_published: site.last_published,
          moderation: site.moderation,
          updated_at: site.updated_at,
          profile_image: site.profile_image,
          theme: site.theme,
          role,
          group: row.group_id && row.group_name ? { id: row.group_id, name: row.group_name } : null,
        });
      });
      return {
        status: 200 as const,
        body: { sites, public_origin: publicOrigin(), limit: SITES_PER_ACCOUNT_MAX },
      };
    } catch (error) {
      log.error('Error listing user sites:', error);
      return { status: 500 as const, body: { error: 'Fehler beim Laden der Websites' } };
    }
  },

  getSiteByHandle: async ({ req, params }) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return { status: 401 as const, body: { error: 'Nicht authentifiziert' } };
      }

      // The id is the fallback for an editor that opened under an address renamed since.
      let rows: UserSiteRow[];
      if (isRowId(params.handle)) {
        rows = await db.query<UserSiteRow>(
          'SELECT * FROM user_sites WHERE id = $1 AND deleted_at IS NULL',
          [params.handle]
        );
      } else {
        const handle = checkSiteHandle(params.handle);
        rows = handle.ok
          ? await db.query<UserSiteRow>(
              'SELECT * FROM user_sites WHERE subdomain = $1 AND deleted_at IS NULL',
              [handle.handle]
            )
          : [];
      }
      const row = rows[0];
      if (!row) {
        return { status: 404 as const, body: { error: 'Website nicht gefunden' } };
      }
      const access = await requireSiteRole(row.id, userId, 'viewer');
      if (typeof access === 'string') return denied(access);
      return {
        status: 200 as const,
        body: { site: toSite(row), role: access.role, public_origin: publicOrigin() },
      };
    } catch (error) {
      log.error('Error fetching user site by handle:', error);
      return { status: 500 as const, body: { error: 'Fehler beim Laden der Website' } };
    }
  },

  // Deprecated: the person's own personal site. Project and shared sites are not "my site".
  getMySite: async ({ req }) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return { status: 401 as const, body: { error: 'Nicht authentifiziert' } };
      }

      const result = await db.query<UserSiteRow>(
        `SELECT * FROM user_sites WHERE user_id = $1 AND group_id IS NULL AND deleted_at IS NULL
         ORDER BY updated_at DESC, id LIMIT 1`,
        [userId]
      );

      const row = result?.[0];
      return {
        status: 200 as const,
        body: { site: row ? toSite(row) : null, public_origin: publicOrigin() },
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
        group_id = null,
      } = body;

      const handle = checkSiteHandle(subdomain);
      if (!handle.ok) {
        return { status: 400 as const, body: { error: HANDLE_MESSAGES[handle.reason] } };
      }

      // The route gate (`requireSitesAccess`) covers the person; a project site asks again
      // here, so the rule survives a change of the mount.
      if (group_id && !(await isUserSitesEntitled(userId))) {
        return {
          status: 403 as const,
          body: { error: 'Sites ist für dein Konto nicht freigeschaltet' },
        };
      }

      // Drizzle, not `db.query`: PostgresService strips the pg code and constraint. The lock
      // (per account, or per project) makes count and insert one step, so a double submit
      // cannot pass the limit twice.
      const row = await getDrizzleInstance().transaction(async (tx) => {
        let live;
        if (group_id) {
          // Live, non-system, non-archived project and an active admin; anything else is 403.
          const admin = await tx.execute(
            sql`SELECT 1 FROM group_memberships gm
                INNER JOIN groups g ON g.id = gm.group_id
                WHERE gm.group_id = ${group_id} AND gm.user_id = ${userId}
                  AND gm.role = 'admin' AND gm.is_active = TRUE
                  AND g.deleted_at IS NULL AND g.is_system = FALSE AND g.archived_at IS NULL`
          );
          if (admin.rows.length === 0) return 'forbidden' as const;
          await tx.execute(
            sql`SELECT pg_advisory_xact_lock(hashtext(${siteGroupLockKey(group_id)}))`
          );
          live = await tx.execute<{ n: number }>(
            sql`SELECT count(*)::int AS n FROM user_sites
                WHERE group_id = ${group_id} AND deleted_at IS NULL`
          );
        } else {
          await tx.execute(
            sql`SELECT pg_advisory_xact_lock(hashtext(${siteAccountLockKey(userId)}))`
          );
          live = await tx.execute<{ n: number }>(
            sql`SELECT count(*)::int AS n FROM user_sites
                WHERE user_id = ${userId} AND group_id IS NULL AND deleted_at IS NULL`
          );
        }
        if (Number(live.rows[0]?.n ?? 0) >= SITES_PER_ACCOUNT_MAX) return 'limit' as const;
        const result = await tx.execute<UserSiteRawRow>(
          sql`INSERT INTO user_sites (
              user_id, group_id, subdomain, site_title, tagline, theme, is_published,
              contact_email, contact_phone, social_links, profile_image, background_image,
              sections, legal
            )
            VALUES (
              ${userId}, ${group_id}, ${handle.handle}, ${site_title}, ${tagline ?? null}, ${theme}, false,
              ${contact_email ?? null}, ${contact_phone ?? null},
              ${social_links ? JSON.stringify(social_links) : null}, ${profile_image ?? null},
              ${background_image ?? null}, ${sections ? JSON.stringify(sections) : null},
              ${legal ? JSON.stringify(legal) : null}
            )
            RETURNING *`
        );
        const created = result.rows[0];
        // A personal site gets its creator as admin member; a project site's admins are the
        // project's own, so it gets no member row.
        if (created && !group_id) {
          await tx.execute(
            sql`INSERT INTO site_members (site_id, user_id, role, added_by)
                VALUES (${created.id}, ${userId}, 'admin', ${userId})`
          );
        }
        return created;
      });

      if (row === 'forbidden') {
        return {
          status: 403 as const,
          body: { error: 'Nur Projekt-Admins können Websites für ein Projekt anlegen' },
        };
      }
      if (row === 'limit') {
        return {
          status: 409 as const,
          body: {
            error: group_id
              ? `Dieses Projekt hat bereits ${SITES_PER_ACCOUNT_MAX} Websites.`
              : `Du hast bereits ${SITES_PER_ACCOUNT_MAX} Websites.`,
          },
        };
      }
      if (!row) {
        return { status: 500 as const, body: { error: 'Fehler beim Erstellen der Website' } };
      }
      return { status: 200 as const, body: { site: toSite(row) } };
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        return { status: 400 as const, body: { error: 'Diese Adresse ist bereits vergeben' } };
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

      // Address and legal notice are admin matters; the whole request is refused, never
      // applied in part.
      const min: SiteRole =
        body.subdomain !== undefined || body.legal !== undefined ? 'admin' : 'editor';
      const access = await requireSiteRole(params.id, userId, min);
      if (typeof access === 'string') return denied(access);

      // The content fields stay accepted (F0). Once the draft is seeded, the next publish
      // overwrites them from the Y.Doc.
      if (body.subdomain !== undefined) {
        return await updateSiteWithAddress(params.id, body.subdomain, body);
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

      values.push(params.id);

      const result = await db.query<UserSiteRow>(
        `UPDATE user_sites
         SET ${updateFields.join(', ')}
         WHERE id = $${paramCounter} AND deleted_at IS NULL
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

      const access = await requireSiteRole(params.id, userId, 'admin');
      if (typeof access === 'string') return denied(access);

      let result: UserSiteRow[] | null;
      if (body.publish) {
        const current = await db.query<UserSiteRow>(
          'SELECT * FROM user_sites WHERE id = $1 AND deleted_at IS NULL',
          [params.id]
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
          await resolvePublishLocale({ groupId: access.groupId, creatorId: access.creatorId })
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
        // The row gets only the fixed shape and bounds a PUT would accept: no extra keys a
        // client wrote into the Y.Doc, no unbounded values.
        const parsedColumns = PUBLISH_ROW_COLUMNS.safeParse(siteDraftToRowColumns(draft));
        if (!parsedColumns.success) {
          return {
            status: 422 as const,
            body: {
              error: 'Die Website kann noch nicht veröffentlicht werden',
              issues: parsedColumns.error.issues.map((issue) => ({
                path: issue.path.join('.'),
                message: issue.message,
              })),
            },
          };
        }
        const columns = parsedColumns.data;
        result = await db.query<UserSiteRow>(
          `UPDATE user_sites
           SET site_title = $1, tagline = $2, profile_image = $3, theme = $4,
               contact_email = $5, contact_phone = $6, social_links = $7, sections = $8,
               published_snapshot = $9, is_published = true, last_published = CURRENT_TIMESTAMP
           WHERE id = $10 AND deleted_at IS NULL
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
          ]
        );
      } else {
        result = await db.query<UserSiteRow>(
          `UPDATE user_sites
           SET is_published = false, published_snapshot = NULL
           WHERE id = $1 AND deleted_at IS NULL
           RETURNING *`,
          [params.id]
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

      // A viewer connects to the room read-only, so the seed must not wait for an editor.
      const access = await requireSiteRole(params.id, userId, 'viewer');
      if (typeof access === 'string') return denied(access);

      const result = await db.query<UserSiteRow>(
        'SELECT * FROM user_sites WHERE id = $1 AND deleted_at IS NULL',
        [params.id]
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

      // Into the Papierkorb (admin only; trashUserSite closes the open editors).
      const result = await trashUserSite(userId, params.id);
      if (result !== 'ok') return denied(result);

      return { status: 200 as const, body: { success: true } };
    } catch (error) {
      log.error('Error deleting site:', error);
      return { status: 500 as const, body: { error: 'Fehler beim Löschen der Website' } };
    }
  },

  listSiteMembers: async ({ req, params }) => {
    try {
      const userId = getUserId(req);
      if (!userId) return UNAUTHENTICATED;
      const access = await requireSiteRole(params.id, userId, 'admin');
      if (typeof access === 'string') return denied(access);
      return { status: 200 as const, body: { members: await listSiteMembers(params.id) } };
    } catch (error) {
      log.error('Error listing site members:', error);
      return { status: 500 as const, body: { error: 'Fehler beim Laden der Mitglieder' } };
    }
  },

  setSiteMemberRole: async ({ req, params, body }) => {
    try {
      const userId = getUserId(req);
      if (!userId) return UNAUTHENTICATED;
      // First, so a missing site is a 404 and not "not eligible".
      const access = await requireSiteRole(params.id, userId, 'admin');
      if (typeof access === 'string') return denied(access);

      const result = await setSiteMemberRole({
        siteId: params.id,
        actorId: userId,
        targetId: params.userId,
        role: body.role,
      });
      if (result === 'last_admin') {
        return {
          status: 409 as const,
          body: { error: 'Die Website braucht mindestens eine Admin', code: 'last_admin' as const },
        };
      }
      if (result === 'not_eligible') {
        return {
          status: 422 as const,
          body: {
            error: 'Die Person teilt kein Projekt mit dir und ist nicht auf der Website',
            code: 'not_eligible' as const,
          },
        };
      }
      return { status: 200 as const, body: { success: true } };
    } catch (error) {
      log.error('Error setting site member role:', error);
      return { status: 500 as const, body: { error: 'Fehler beim Ändern der Rolle' } };
    }
  },

  removeSiteMember: async ({ req, params }) => {
    try {
      const userId = getUserId(req);
      if (!userId) return UNAUTHENTICATED;
      // Leaving is for everyone with a role; removing somebody else is for admins.
      const leaving = params.userId === userId;
      const access = await requireSiteRole(params.id, userId, leaving ? 'viewer' : 'admin');
      if (typeof access === 'string') return denied(access);

      const result = await removeSiteMember({ siteId: params.id, targetId: params.userId });
      if (result === 'last_admin') {
        return {
          status: 409 as const,
          body: { error: 'Die Website braucht mindestens eine Admin', code: 'last_admin' as const },
        };
      }
      if (result === 'not_found') {
        return { status: 404 as const, body: { error: 'Mitglied nicht gefunden' } };
      }
      return { status: 204 as const, body: undefined };
    } catch (error) {
      log.error('Error removing site member:', error);
      return { status: 500 as const, body: { error: 'Fehler beim Entfernen des Mitglieds' } };
    }
  },

  listSiteGroups: async ({ req, params }) => {
    try {
      const userId = getUserId(req);
      if (!userId) return UNAUTHENTICATED;
      const access = await requireSiteRole(params.id, userId, 'admin');
      if (typeof access === 'string') return denied(access);
      if (access.groupId !== null) return NOT_PERSONAL;

      const rows = await db.query<{ id: string; name: string; write: boolean }>(
        `SELECT g.id, g.name, (gcs.permissions->>'write') = 'true' AS write
           FROM group_content_shares gcs
           INNER JOIN groups g ON g.id = gcs.group_id AND g.deleted_at IS NULL
          WHERE gcs.content_type = 'user_sites' AND gcs.content_id = $1
          ORDER BY g.name`,
        [params.id]
      );
      return {
        status: 200 as const,
        body: {
          groups: (rows ?? []).map((r) => ({ groupId: r.id, name: r.name, write: r.write })),
        },
      };
    } catch (error) {
      log.error('Error listing site groups:', error);
      return { status: 500 as const, body: { error: 'Fehler beim Laden der Projekte' } };
    }
  },

  setSiteGroup: async ({ req, params, body }) => {
    try {
      const userId = getUserId(req);
      if (!userId) return UNAUTHENTICATED;
      const access = await requireSiteRole(params.id, userId, 'admin');
      if (typeof access === 'string') return denied(access);
      if (access.groupId !== null) return NOT_PERSONAL;

      try {
        await addGroupShare({
          userId,
          groupId: params.groupId,
          contentType: 'user_sites',
          contentId: params.id,
          permissions: { read: true, write: body.write },
          onExisting: 'update-permissions',
        });
      } catch (error) {
        if (error instanceof GroupShareForbiddenError) return denied('forbidden');
        throw error;
      }
      return { status: 200 as const, body: { success: true } };
    } catch (error) {
      log.error('Error sharing site with project:', error);
      return { status: 500 as const, body: { error: 'Fehler beim Teilen mit dem Projekt' } };
    }
  },

  removeSiteGroup: async ({ req, params }) => {
    try {
      const userId = getUserId(req);
      if (!userId) return UNAUTHENTICATED;
      const access = await requireSiteRole(params.id, userId, 'admin');
      if (typeof access === 'string') return denied(access);
      if (access.groupId !== null) return NOT_PERSONAL;

      const removed = await removeGroupShare({
        groupId: params.groupId,
        contentType: 'user_sites',
        contentId: params.id,
      });
      if (!removed) return { status: 404 as const, body: { error: 'Freigabe nicht gefunden' } };
      return { status: 204 as const, body: undefined };
    } catch (error) {
      log.error('Error removing site share:', error);
      return { status: 500 as const, body: { error: 'Fehler beim Aufheben der Freigabe' } };
    }
  },
});

export function mountSitesContractRouter(app: Application): void {
  createExpressEndpoints(sitesContract, sitesContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'sitesContract'),
  });
}
