import { useLocalSearchParams } from 'expo-router';

import { MarketplaceLandesverbandScreen } from '../../../../components/marketplace/MarketplaceLandesverbandScreen';

/** `/marktplatz/landesverband/<slug>` — the same path as the web page. */
export default function MarketplaceLandesverbandRoute() {
  const { slug = '' } = useLocalSearchParams<{ slug: string }>();
  return <MarketplaceLandesverbandScreen key={slug} slug={slug} />;
}
