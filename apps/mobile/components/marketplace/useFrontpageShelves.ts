import {
  type MarketplaceKind,
  type MarketplaceOrigin,
  type MarketplaceSort,
} from '@gruenerator/contracts';
import {
  FRONTPAGE_SHELVES,
  FRONTPAGE_TEXT_KINDS,
  FRONTPAGE_VISUAL_KINDS,
  useMarketplaceItem,
  useMarketplaceSections,
  type FrontpageInput,
  type MarketplaceFeature,
} from '@gruenerator/shared/marketplace';

const BASE = { q: '', scope: 'shop', platform: 'mobile' } as const;

function useShelf(
  kinds: readonly MarketplaceKind[],
  sort: MarketplaceSort,
  sectionLimit: number,
  origin: MarketplaceOrigin | null = null,
  enabled = true
) {
  return useMarketplaceSections({ ...BASE, kinds, sort, origin, sectionLimit, enabled }).sections;
}

/**
 * The requests behind the front page, in one place: today one `sections` query
 * per shelf plus the curated item. A single front-page endpoint replaces this
 * hook's body, not its callers. What each shelf shows is `frontpageView`'s job.
 */
export function useFrontpageShelves(
  feature: MarketplaceFeature | null,
  hasLandesverband: boolean
): Omit<FrontpageInput, 'feature' | 'hasLandesverband'> {
  const newest = useShelf(FRONTPAGE_TEXT_KINDS, 'neu', FRONTPAGE_SHELVES.neu.show);
  const popular = useShelf(FRONTPAGE_TEXT_KINDS, 'beliebt', FRONTPAGE_SHELVES.beliebt.show);
  const visuals = useShelf(FRONTPAGE_VISUAL_KINDS, 'empfohlen', FRONTPAGE_SHELVES.gestalten.show);
  const landesverband = useShelf(
    FRONTPAGE_TEXT_KINDS,
    'empfohlen',
    FRONTPAGE_SHELVES.landesverband.show,
    'landesverband',
    hasLandesverband
  );
  const featured = useMarketplaceItem(feature, { platform: 'mobile' });
  return {
    featured: {
      item: featured.data ?? null,
      pending: featured.isPending,
      failed: featured.isError,
    },
    newest,
    popular,
    visuals,
    landesverband,
  };
}
