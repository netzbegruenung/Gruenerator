/**
 * Verbatim copy of `SITE_ROLE_SQL` in `apps/api/services/sites/siteRoleSql.ts` (this service has no
 * runtime dependency on apps/api). `siteRoleSql.vitest.ts` in apps/api compares both; edit together.
 * Takes `$1` site id, `$2` user id; returns at most one row `{ role, group_id, user_id }`.
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
