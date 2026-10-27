import { stickerDiscoverToMarketplaceHref } from '@gruenerator/shared/marketplace';
import { Redirect, useLocalSearchParams, type Href } from 'expo-router';

/**
 * The old „Entdecken" for Sticker und Hintergründe. It is the Marktplatz now;
 * this path stays forever: shipped binaries and links may still open it.
 */
export default function LegacyStickerDiscoverRoute() {
  return <Redirect href={stickerDiscoverToMarketplaceHref(useLocalSearchParams()) as Href} />;
}
