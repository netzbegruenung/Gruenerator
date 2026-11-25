/**
 * Effective role of one person on one Website — the single decision for who may read, edit or
 * administer it. Plain text with only `$1` (site id) and `$2` (user id): services/hocuspocus
 * carries a verbatim copy and a guard compares both whitespace-normalised. Edit both together.
 *
 * Returns one row `{ role, group_id, user_id }` (the highest role wins) or none:
 *  1. `site_members.role`;
 *  2. project site (`group_id`): active member of a live, non-system project → project admin is
 *     `admin`, any other member `editor`;
 *  3. personal site shared into a project (`group_content_shares`, `user_sites`): active member →
 *     `editor` with `write`, else `viewer`; never `admin`.
 * An archived project caps ways 2 and 3 at `viewer`; `moderation = 'removed'` caps everything.
 *
 * Note: project admin here is `gm.role = 'admin'`, whereas groupMembership.ts also treats
 * `groups.created_by` as admin. Equivalent today: creating a project inserts an admin membership
 * and the creator's role cannot change.
 */
export const SITE_ROLE_SQL = `
WITH site AS (
  SELECT id, user_id, group_id, moderation
    FROM user_sites
   WHERE id = $1 AND deleted_at IS NULL
),
candidates AS (
  SELECT sm.role AS role
    FROM site
   INNER JOIN site_members sm ON sm.site_id = site.id AND sm.user_id = $2
  UNION ALL
  SELECT CASE
           WHEN g.archived_at IS NOT NULL THEN 'viewer'
           WHEN gm.role = 'admin' THEN 'admin'
           ELSE 'editor'
         END AS role
    FROM site
   INNER JOIN group_memberships gm ON gm.group_id = site.group_id AND gm.user_id = $2 AND gm.is_active = TRUE
   INNER JOIN groups g ON g.id = gm.group_id AND g.deleted_at IS NULL AND g.is_system = FALSE
  UNION ALL
  SELECT CASE
           WHEN g.archived_at IS NOT NULL THEN 'viewer'
           WHEN gcs.permissions->>'write' = 'true' THEN 'editor'
           ELSE 'viewer'
         END AS role
    FROM site
   INNER JOIN group_content_shares gcs ON gcs.content_type = 'user_sites' AND gcs.content_id = site.id::text AND gcs.group_id IS NOT NULL
   INNER JOIN group_memberships gm ON gm.group_id = gcs.group_id AND gm.user_id = $2 AND gm.is_active = TRUE
   INNER JOIN groups g ON g.id = gm.group_id AND g.deleted_at IS NULL AND g.is_system = FALSE
   WHERE site.group_id IS NULL
     AND COALESCE(gcs.permissions->>'read', 'true') <> 'false'
)
SELECT CASE WHEN site.moderation = 'removed' THEN 'viewer' ELSE c.role END AS role,
       site.group_id,
       site.user_id
  FROM candidates c
 CROSS JOIN site
 ORDER BY CASE c.role WHEN 'admin' THEN 3 WHEN 'editor' THEN 2 ELSE 1 END DESC
 LIMIT 1
`;

/**
 * `SITE_ROLE_SQL` for many sites at once (`$1` = uuid[] of site ids, `$2` = user id): one row
 * `{ id, role }` per site the person has a role on. Same rules, same text per branch — keep in
 * step with `SITE_ROLE_SQL`; `siteMembers.db.vitest.ts` asserts both give the same roles.
 */
export const SITE_ROLES_BATCH_SQL = `
WITH site AS (
  SELECT id, user_id, group_id, moderation
    FROM user_sites
   WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL
),
candidates AS (
  SELECT site.id AS site_id, sm.role AS role
    FROM site
   INNER JOIN site_members sm ON sm.site_id = site.id AND sm.user_id = $2
  UNION ALL
  SELECT site.id AS site_id,
         CASE
           WHEN g.archived_at IS NOT NULL THEN 'viewer'
           WHEN gm.role = 'admin' THEN 'admin'
           ELSE 'editor'
         END AS role
    FROM site
   INNER JOIN group_memberships gm ON gm.group_id = site.group_id AND gm.user_id = $2 AND gm.is_active = TRUE
   INNER JOIN groups g ON g.id = gm.group_id AND g.deleted_at IS NULL AND g.is_system = FALSE
  UNION ALL
  SELECT site.id AS site_id,
         CASE
           WHEN g.archived_at IS NOT NULL THEN 'viewer'
           WHEN gcs.permissions->>'write' = 'true' THEN 'editor'
           ELSE 'viewer'
         END AS role
    FROM site
   INNER JOIN group_content_shares gcs ON gcs.content_type = 'user_sites' AND gcs.content_id = site.id::text AND gcs.group_id IS NOT NULL
   INNER JOIN group_memberships gm ON gm.group_id = gcs.group_id AND gm.user_id = $2 AND gm.is_active = TRUE
   INNER JOIN groups g ON g.id = gm.group_id AND g.deleted_at IS NULL AND g.is_system = FALSE
   WHERE site.group_id IS NULL
     AND COALESCE(gcs.permissions->>'read', 'true') <> 'false'
)
SELECT DISTINCT ON (c.site_id)
       c.site_id AS id,
       CASE WHEN site.moderation = 'removed' THEN 'viewer' ELSE c.role END AS role
  FROM candidates c
 INNER JOIN site ON site.id = c.site_id
 ORDER BY c.site_id, CASE c.role WHEN 'admin' THEN 3 WHEN 'editor' THEN 2 ELSE 1 END DESC
`;
