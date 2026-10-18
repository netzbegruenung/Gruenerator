import {
  parseMarketplaceParams,
  serializeMarketplaceParams,
} from '@gruenerator/shared/marketplace';
import { useLocalSearchParams } from 'expo-router';

import { MarketplaceScreen } from '../../components/marketplace/MarketplaceScreen';

/**
 * `/marktplatz?art=&von=&q=&sort=&item=` — the same params as the web page
 * (F0); `item=<kind>:<ref>` opens that item's detail, also from a shared link.
 */
export default function MarketplaceRoute() {
  const filters = parseMarketplaceParams(useLocalSearchParams());
  // A link into the open screen starts it over with its own filters.
  return (
    <MarketplaceScreen
      key={serializeMarketplaceParams(filters).toString()}
      initialFilters={filters}
    />
  );
}
