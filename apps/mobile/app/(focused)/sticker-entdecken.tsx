import { useLocalSearchParams } from 'expo-router';

import { StudioAssetsDiscoverScreen } from '../../components/studio-assets/StudioAssetsDiscoverScreen';

export default function StickerDiscoverRoute() {
  const { q } = useLocalSearchParams<{ q?: string }>();
  return <StudioAssetsDiscoverScreen initialQuery={typeof q === 'string' ? q : ''} />;
}
