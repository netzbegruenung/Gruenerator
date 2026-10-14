import { useAuth } from '@gruenerator/shared/hooks';
import { useLocalSearchParams } from 'expo-router';

import { parseCreatorReturn } from '../../components/studio-assets/creator/creatorModel';
import { StickerCreatorScreen } from '../../components/studio-assets/creator/StickerCreatorScreen';

export default function StickerCreatorRoute() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{ return?: string }>();
  return (
    <StickerCreatorScreen
      locale={user?.locale === 'de-AT' ? 'de-AT' : 'de-DE'}
      returnTo={parseCreatorReturn(params.return)}
    />
  );
}
