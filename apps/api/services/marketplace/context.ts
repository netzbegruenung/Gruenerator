/**
 * Was der Marktplatz einmal pro Anfrage über die Person weiß. Die Teile für
 * den offiziellen Katalog (Rollen, Admin-Sperren) kosten drei Abfragen und
 * werden erst geladen, wenn eine Quelle sie braucht — eine Sticker-Liste fragt
 * nie danach.
 */
import { type GroupAudience, type MarketplacePlatform } from '@gruenerator/contracts';
import {
  getLandesverbandHubById,
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

type Roles = Awaited<ReturnType<typeof loadUserRoles>>;

export interface MarketplaceContext {
  userId: string;
  /** The viewer's country; every source shows `audience ∈ {audience, 'all'}`. */
  audience: ViewerAudience;
  instanceId: InstanceId;
  platform: MarketplacePlatform;
  /** The official catalogue for this viewer — memoised, loaded on first use. */
  officialCatalog(): Promise<OfficialCatalog>;
  /**
   * The same catalogue without the Landesverband assignment — what an item
   * link, a like or a save may resolve. The assignment decides discovery, not
   * access: `/agents/<slug>` opens every Landesverband's agents too.
   */
  resolvableCatalog(): Promise<OfficialCatalog>;
}

/**
 * The Landesverband a request asks for (`?lv=`), through the same gate as
 * `/agents/<slug>`: unknown, switched off (`enabled: false`) or for the other
 * country gives `[]` — no Landesverband content, never someone else's.
 */
function requestedLvIds(
  lvId: string,
  audience: ViewerAudience,
  instanceId: InstanceId
): readonly string[] {
  const hub = getLandesverbandHubById(lvId, instanceId);
  return hub && hub.audience === audience ? [hub.lvId] : [];
}

export function buildMarketplaceContext(params: {
  userId: string;
  locale: string | null;
  platform: MarketplacePlatform;
  instanceId?: InstanceId;
  /** `?lv=` — one Landesverband instead of the viewer's own (see `requestedLvIds`). */
  lvId?: string | null;
}): MarketplaceContext {
  const audience: ViewerAudience = params.locale === 'de-AT' ? 'de-AT' : 'de-DE';
  const instanceId = params.instanceId ?? CURRENT_INSTANCE;
  const lvId = params.lvId ?? null;
  let inputs: Promise<{
    roles: Roles;
    hiddenAgentIds: string[];
    hiddenSkillMentions: string[];
  }> | null = null;
  let catalog: Promise<OfficialCatalog> | null = null;
  let resolvable: Promise<OfficialCatalog> | null = null;

  const loadInputs = () => {
    inputs ??= (async () => {
      const [roles, landesverbandId, hiddenAgentIds] = await Promise.all([
        loadUserRoles(params.userId),
        getUserLandesverbandId(params.userId),
        getHiddenAgentIdentifiersCached(),
      ]);
      const hiddenSkillMentions = await getEffectiveHiddenSkillMentions(landesverbandId);
      return { roles, hiddenAgentIds, hiddenSkillMentions: [...hiddenSkillMentions] };
    })();
    return inputs;
  };

  const select = async (lvIds: (roles: Roles) => readonly string[] | null) => {
    const { roles, hiddenAgentIds, hiddenSkillMentions } = await loadInputs();
    return selectOfficialCatalog({
      locale: audience,
      instanceId,
      platform: params.platform,
      hiddenAgentIds,
      hiddenSkillMentions,
      lvIds: lvIds(roles),
    });
  };

  return {
    userId: params.userId,
    audience,
    instanceId,
    platform: params.platform,
    officialCatalog() {
      // Server-side the roles are always known: no role is `[]`, never `null`.
      catalog ??= select((roles) =>
        lvId !== null
          ? requestedLvIds(lvId, audience, instanceId)
          : landesverbandIdsForRoles(roles, audience)
      );
      return catalog;
    },
    resolvableCatalog() {
      resolvable ??= select(() => null);
      return resolvable;
    },
  };
}

/** The one DE/AT rule: content for the viewer's country or for both. */
export function isForAudience(ctx: MarketplaceContext, audience: string | null): boolean {
  return audience === null || audience === 'all' || audience === ctx.audience;
}
