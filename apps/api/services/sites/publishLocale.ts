/**
 * The locale a Website is published in. Never the caller's: a co-admin in another country must
 * not flip the language of the snapshot. A project site follows its project's Landesverband
 * (an Austrian one means `de-AT`); otherwise the creator's profile decides; else `de-DE`.
 */
import { LANDESVERBAND_ENTRIES } from '@gruenerator/shared/agents';

import { getPostgresInstance } from '../../database/services/PostgresService.js';

export type PublishLocale = 'de-DE' | 'de-AT';

export async function resolvePublishLocale(site: {
  groupId: string | null;
  creatorId: string | null;
}): Promise<PublishLocale> {
  const db = getPostgresInstance();
  if (site.groupId) {
    const groups = await db.query<{ landesverband: string | null }>(
      'SELECT landesverband FROM groups WHERE id = $1 AND deleted_at IS NULL',
      [site.groupId]
    );
    const lv = LANDESVERBAND_ENTRIES.find((entry) => entry.id === groups[0]?.landesverband);
    if (lv) return lv.audience;
  }
  if (site.creatorId) {
    const profiles = await db.query<{ locale: string | null }>(
      'SELECT locale FROM profiles WHERE id = $1',
      [site.creatorId]
    );
    if (profiles[0]?.locale === 'de-AT') return 'de-AT';
  }
  return 'de-DE';
}
