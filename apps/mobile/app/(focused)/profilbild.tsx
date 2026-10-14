import { useAuth } from '@gruenerator/shared/hooks';
import { parseProfilbildAssetParams } from '@gruenerator/shared/stickers';
import { useLocalSearchParams } from 'expo-router';

import { ProfilbildScreen } from '../../components/profilbild/ProfilbildScreen';

export default function ProfilbildRoute() {
  const { user } = useAuth();
  const params = useLocalSearchParams<Record<string, string>>();
  // A gallery's „Im Profilbild verwenden" hands the item over as route params.
  const galleryAsset = parseProfilbildAssetParams({
    get: (key) => (typeof params[key] === 'string' ? params[key] : null),
  });
  return (
    <ProfilbildScreen
      isAustria={user?.locale === 'de-AT'}
      shareToken={params.share ?? null}
      galleryAsset={galleryAsset}
    />
  );
}
