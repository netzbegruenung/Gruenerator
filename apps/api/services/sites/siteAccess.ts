/** Who may do what on a Website: one query (`SITE_ROLE_SQL`), ranked admin > editor > viewer. */
import { type SiteRole } from '@gruenerator/contracts';

import { getPostgresInstance } from '../../database/services/PostgresService.js';

import { SITE_ROLE_SQL, SITE_ROLES_BATCH_SQL } from './siteRoleSql.js';

const RANK: Record<SiteRole, number> = { viewer: 1, editor: 2, admin: 3 };

interface RoleRow {
  role: SiteRole;
  group_id: string | null;
  user_id: string | null;
}

async function loadRole(siteId: string, userId: string): Promise<RoleRow | null> {
  const rows = await getPostgresInstance().query<RoleRow>(SITE_ROLE_SQL, [siteId, userId]);
  return rows[0] ?? null;
}

export async function getSiteRole(siteId: string, userId: string): Promise<SiteRole | null> {
  return (await loadRole(siteId, userId))?.role ?? null;
}

/** `getSiteRole` for many sites in one query; sites without a role are absent from the map. */
export async function getSiteRoles(
  siteIds: string[],
  userId: string
): Promise<Map<string, SiteRole>> {
  if (siteIds.length === 0) return new Map();
  const rows = await getPostgresInstance().query<{ id: string; role: SiteRole }>(
    SITE_ROLES_BATCH_SQL,
    [siteIds, userId]
  );
  return new Map(rows.map((row) => [row.id, row.role]));
}

export function hasRole(actual: SiteRole | null, min: SiteRole): boolean {
  return actual !== null && RANK[actual] >= RANK[min];
}

/** `not_found` without any role (no existence leak), `forbidden` below `min`. */
export async function requireSiteRole(
  siteId: string,
  userId: string,
  min: SiteRole
): Promise<
  { role: SiteRole; groupId: string | null; creatorId: string | null } | 'not_found' | 'forbidden'
> {
  const row = await loadRole(siteId, userId);
  if (!row) return 'not_found';
  if (!hasRole(row.role, min)) return 'forbidden';
  return { role: row.role, groupId: row.group_id, creatorId: row.user_id };
}
