/**
 * Was der Marktplatz einmal pro Anfrage über die Person weiß. Die Teile für
 * den offiziellen Katalog (Rollen, Admin-Sperren) kosten drei Abfragen und
 * werden erst geladen, wenn eine Quelle sie braucht — eine Sticker-Liste fragt
 * nie danach.
 */
import { type GroupAudience, type MarketplacePlatform } from '@gruenerator/contracts';
import {
  landesverbandIdsForRoles,
  selectOfficialCatalog,
  type OfficialCatalog,
} from '@gruenerator/shared/agents';
import { type InstanceId } from '@gruenerator/shared/instances';

import { CURRENT_INSTANCE } from '../../config/instance.js';
import { getHiddenAgentIdentifiersCached } from '../agents/AdminHiddenAgentsService.js';
import { getUserLandesverbandId } from '../landesverband/LandesverbandDerivationService.js';
import { loadUserRoles } from '../roles/userRoles.js';
import { getEffectiveHiddenSkillMentions } from '../skills/AdminHiddenSkillsService.js';

export type ViewerAudience = Exclude<GroupAudience, 'all'>;

export interface MarketplaceContext {
  userId: string;
  /** The viewer's country; every source shows `audience ∈ {audience, 'all'}`. */
  audience: ViewerAudience;
  instanceId: InstanceId;
  platform: MarketplacePlatform;
  /** The official catalogue for this viewer — memoised, loaded on first use. */
  officialCatalog(): Promise<OfficialCatalog>;
}

export function buildMarketplaceContext(params: {
  userId: string;
  locale: string | null;
  platform: MarketplacePlatform;
  instanceId?: InstanceId;
}): MarketplaceContext {
  const audience: ViewerAudience = params.locale === 'de-AT' ? 'de-AT' : 'de-DE';
  const instanceId = params.instanceId ?? CURRENT_INSTANCE;
  let catalog: Promise<OfficialCatalog> | null = null;

  return {
    userId: params.userId,
    audience,
    instanceId,
    platform: params.platform,
    officialCatalog() {
      catalog ??= (async () => {
        const [roles, landesverbandId, hiddenAgentIds] = await Promise.all([
          loadUserRoles(params.userId),
          getUserLandesverbandId(params.userId),
          getHiddenAgentIdentifiersCached(),
        ]);
        const hiddenSkillMentions = await getEffectiveHiddenSkillMentions(landesverbandId);
        return selectOfficialCatalog({
          locale: audience,
          instanceId,
          platform: params.platform,
          hiddenAgentIds,
          hiddenSkillMentions: [...hiddenSkillMentions],
          // Server-side the roles are always known: no role is `[]`, never `null`.
          lvIds: landesverbandIdsForRoles(roles, audience),
        });
      })();
      return catalog;
    },
  };
}

/** The one DE/AT rule: content for the viewer's country or for both. */
export function isForAudience(ctx: MarketplaceContext, audience: string | null): boolean {
  return audience === null || audience === 'all' || audience === ctx.audience;
}
