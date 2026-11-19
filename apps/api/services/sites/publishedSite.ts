import { type PublishedSiteSnapshot, publishedSiteSnapshotSchema } from '@gruenerator/contracts';
import { and, eq, isNotNull } from 'drizzle-orm';
import { type NodePgDatabase } from 'drizzle-orm/node-postgres';

import { notTrashed } from '../../database/trash.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
import { userSites } from '../../database/schema/sites.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('publishedSite');

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
        notTrashed(userSites)
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
