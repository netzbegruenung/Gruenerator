import {
  type MarketplaceCollectionId,
  type MarketplaceFrontpageShelfId,
  type MarketplaceItem,
} from '@gruenerator/contracts';
import {
  featureById,
  useMarketplaceFrontpage,
  type MarketplaceFeature,
} from '@gruenerator/shared/marketplace';

export interface FrontpageView {
  focus: MarketplaceItem | null;
  /** `null` = the fallback item, which has no pitch or example of its own. */
  focusFeature: MarketplaceFeature | null;
  focusPending: boolean;
  landesverband: MarketplaceItem[];
  neu: MarketplaceItem[];
  beliebt: MarketplaceItem[];
  gestalten: MarketplaceItem[];
  collections: { collectionId: MarketplaceCollectionId; items: MarketplaceItem[] }[];
}

/**
 * The front page in one request (`GET /api/marketplace/frontpage`): the server
 * applies the shelf rules from shared, this hook only reads the answer. The
 * Landesverband shelf also needs the viewer's own Landesverband for its label.
 */
export function useFrontpageShelves(hasLandesverband: boolean): FrontpageView {
  const page = useMarketplaceFrontpage({ platform: 'mobile' });
  const shelf = (id: MarketplaceFrontpageShelfId) =>
    page.data?.shelves.find((s) => s.shelfId === id)?.items ?? [];
  return {
    focus: page.data?.featured ?? null,
    focusFeature: featureById(page.data?.featureId ?? null),
    focusPending: page.isPending,
    landesverband: hasLandesverband ? shelf('landesverband') : [],
    neu: shelf('neu'),
    beliebt: shelf('beliebt'),
    gestalten: shelf('gestalten'),
    collections: page.data?.collections ?? [],
  };
}
