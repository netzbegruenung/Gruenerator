import {
  parseMarketplaceParams,
  serializeMarketplaceParams,
} from '@gruenerator/shared/marketplace';
import { Stack, useLocalSearchParams } from 'expo-router';

import { MarketplaceScreen } from '../../components/marketplace/MarketplaceScreen';

/**
 * `/marktplatz?art=&von=&q=&sort=&item=` — the same params as the web page
 * (F0); `item=<kind>:<ref>` opens that item's detail, also from a shared link.
 */
export default function MarketplaceRoute() {
  const filters = parseMarketplaceParams(useLocalSearchParams());
  // A link into the open screen starts it over with its own filters.
  return (
    <>
      {/* An item's page: the back button already says „Marktplatz", a title would repeat it. */}
      {filters.item ? <Stack.Screen options={{ title: '' }} /> : null}
      <MarketplaceScreen
        key={serializeMarketplaceParams(filters).toString()}
        initialFilters={filters}
      />
    </>
  );
}
