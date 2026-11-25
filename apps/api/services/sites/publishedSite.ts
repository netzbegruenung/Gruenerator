import { type PublishedSiteSnapshot, publishedSiteSnapshotSchema } from '@gruenerator/contracts';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { type NodePgDatabase } from 'drizzle-orm/node-postgres';

import { userSites } from '../../database/schema/sites.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
import { notTrashed } from '../../database/trash.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('publishedSite');

/** A project's own site is only public while its project is not in the trash. */
export const owningProjectNotTrashed = sql`(${userSites.group_id} IS NULL OR EXISTS (
  SELECT 1 FROM groups g WHERE g.id = ${userSites.group_id} AND g.deleted_at IS NULL))`;

export function publishedSiteQuery(db: Pick<NodePgDatabase, 'select'>, handle: string) {
  return db
    .select({ published_snapshot: userSites.published_snapshot })
    .from(userSites)
    .where(
      and(
        eq(userSites.subdomain, handle),
        eq(userSites.is_published, true),
        eq(userSites.moderation, 'ok'),
        isNotNull(userSites.published_snapshot),
        notTrashed(userSites),
        owningProjectNotTrashed
      )
    )
    .limit(1);
}

export function parsePublishedSnapshot(
  row: { published_snapshot: unknown } | null
): PublishedSiteSnapshot | null {
  if (!row) return null;
  const parsed = publishedSiteSnapshotSchema.safeParse(row.published_snapshot);
  if (parsed.success) return parsed.data;
  log.warn(
    `stored snapshot does not parse: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`
  );
  return null;
}

export async function loadPublishedSite(handle: string): Promise<PublishedSiteSnapshot | null> {
  return parsePublishedSnapshot(
    (await publishedSiteQuery(getDrizzleInstance(), handle))[0] ?? null
  );
}
