/**
 * Who is on a Website and writing `site_members`. Personal sites (`group_id IS NULL`) must keep at
 * least one admin: the check and the write run in one transaction that first locks the site row
 * and then its admin rows, so two parallel demotions serialise and the second sees the first.
 */
import { type SiteRole } from '@gruenerator/contracts';
import { type PoolClient } from 'pg';

import { getPostgresInstance } from '../../database/services/PostgresService.js';

import { closeSiteRooms } from './userSiteTrash.js';

export type SiteMemberSource = 'member' | 'project' | 'share';

export interface SiteMemberEntry {
  userId: string;
  displayName: string | null;
  role: SiteRole;
  source: SiteMemberSource;
  groupId: string | null;
}

export interface SiteMemberDeps {
  closeSiteRooms: (siteIds: string[]) => Promise<void>;
}

const defaultDeps: SiteMemberDeps = { closeSiteRooms };

/** Same sources and filters as SITE_ROLE_SQL, enumerated per person; the highest role wins. */
const LIST_SQL = `
WITH site AS (
  SELECT id, group_id, moderation FROM user_sites WHERE id = $1 AND deleted_at IS NULL
),
candidates AS (
  SELECT sm.user_id, sm.role, 'member' AS source, NULL::uuid AS group_id, 1 AS src_rank
    FROM site INNER JOIN site_members sm ON sm.site_id = site.id
  UNION ALL
  SELECT gm.user_id,
         CASE WHEN g.archived_at IS NOT NULL THEN 'viewer'
              WHEN gm.role = 'admin' THEN 'admin' ELSE 'editor' END,
         'project', g.id, 2
    FROM site
   INNER JOIN group_memberships gm ON gm.group_id = site.group_id AND gm.is_active = TRUE
   INNER JOIN groups g ON g.id = gm.group_id AND g.deleted_at IS NULL AND g.is_system = FALSE
  UNION ALL
  SELECT gm.user_id,
         CASE WHEN g.archived_at IS NOT NULL THEN 'viewer'
              WHEN gcs.permissions->>'write' = 'true' THEN 'editor' ELSE 'viewer' END,
         'share', g.id, 3
    FROM site
   INNER JOIN group_content_shares gcs ON gcs.content_type = 'user_sites' AND gcs.content_id = site.id::text AND gcs.group_id IS NOT NULL
   INNER JOIN group_memberships gm ON gm.group_id = gcs.group_id AND gm.is_active = TRUE
   INNER JOIN groups g ON g.id = gm.group_id AND g.deleted_at IS NULL AND g.is_system = FALSE
   WHERE site.group_id IS NULL
     AND COALESCE(gcs.permissions->>'read', 'true') <> 'false'
)
SELECT DISTINCT ON (c.user_id)
       c.user_id, p.display_name,
       CASE WHEN site.moderation = 'removed' THEN 'viewer' ELSE c.role END AS role,
       c.source, c.group_id
  FROM candidates c
 CROSS JOIN site
  LEFT JOIN profiles p ON p.id = c.user_id
 ORDER BY c.user_id,
          CASE c.role WHEN 'admin' THEN 3 WHEN 'editor' THEN 2 ELSE 1 END DESC,
          c.src_rank
`;

export async function listSiteMembers(siteId: string): Promise<SiteMemberEntry[]> {
  const rows = await getPostgresInstance().query<{
    user_id: string;
    display_name: string | null;
    role: SiteRole;
    source: SiteMemberSource;
    group_id: string | null;
  }>(LIST_SQL, [siteId]);
  return rows.map((r) => ({
    userId: r.user_id,
    displayName: r.display_name,
    role: r.role,
    source: r.source,
    groupId: r.group_id,
  }));
}

/** Lock the live site row, then its admin rows; returns whether the site is personal and its admins. */
async function lockSite(
  tx: PoolClient,
  siteId: string
): Promise<{ personal: boolean; admins: string[] } | null> {
  const site = await tx.query<{ group_id: string | null }>(
    'SELECT group_id FROM user_sites WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
    [siteId]
  );
  if (site.rows.length === 0) return null;
  const admins = await tx.query<{ user_id: string }>(
    "SELECT user_id FROM site_members WHERE site_id = $1 AND role = 'admin' FOR UPDATE",
    [siteId]
  );
  return { personal: site.rows[0].group_id === null, admins: admins.rows.map((r) => r.user_id) };
}

const isLastAdmin = (admins: string[], targetId: string) =>
  admins.length === 1 && admins[0] === targetId;

export async function setSiteMemberRole(
  input: { siteId: string; actorId: string; targetId: string; role: SiteRole },
  deps: SiteMemberDeps = defaultDeps
): Promise<'ok' | 'last_admin' | 'not_eligible'> {
  const { siteId, actorId, targetId, role } = input;
  const result = await getPostgresInstance().transaction<'ok' | 'last_admin' | 'not_eligible'>(
    async (tx) => {
      const locked = await lockSite(tx, siteId);
      if (!locked) return 'not_eligible';

      const eligible = await tx.query(
        `SELECT 1 FROM site_members WHERE site_id = $1 AND user_id = $2
         UNION ALL
         SELECT 1
           FROM group_memberships a
          INNER JOIN group_memberships t ON t.group_id = a.group_id AND t.user_id = $3 AND t.is_active = TRUE
          INNER JOIN groups g ON g.id = a.group_id AND g.deleted_at IS NULL AND g.archived_at IS NULL AND g.is_system = FALSE
          WHERE a.user_id = $4 AND a.is_active = TRUE
          LIMIT 1`,
        [siteId, targetId, targetId, actorId]
      );
      if (eligible.rows.length === 0) return 'not_eligible';

      if (locked.personal && role !== 'admin' && isLastAdmin(locked.admins, targetId)) {
        return 'last_admin';
      }
      await tx.query(
        `INSERT INTO site_members (site_id, user_id, role, added_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (site_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
        [siteId, targetId, role, actorId]
      );
      return 'ok';
    }
  );
  if (result === 'ok') await deps.closeSiteRooms([siteId]);
  return result;
}

export async function removeSiteMember(
  input: { siteId: string; targetId: string },
  deps: SiteMemberDeps = defaultDeps
): Promise<'ok' | 'last_admin' | 'not_found'> {
  const { siteId, targetId } = input;
  const result = await getPostgresInstance().transaction<'ok' | 'last_admin' | 'not_found'>(
    async (tx) => {
      const locked = await lockSite(tx, siteId);
      if (!locked) return 'not_found';
      if (locked.personal && isLastAdmin(locked.admins, targetId)) return 'last_admin';
      const del = await tx.query('DELETE FROM site_members WHERE site_id = $1 AND user_id = $2', [
        siteId,
        targetId,
      ]);
      return (del.rowCount ?? 0) > 0 ? 'ok' : 'not_found';
    }
  );
  if (result === 'ok') await deps.closeSiteRooms([siteId]);
  return result;
}
