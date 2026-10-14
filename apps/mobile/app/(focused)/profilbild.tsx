import { useAuth } from '@gruenerator/shared/hooks';
import { useLocalSearchParams } from 'expo-router';

import { ProfilbildScreen } from '../../components/profilbild/ProfilbildScreen';

export default function ProfilbildRoute() {
  const { user } = useAuth();
  const { share } = useLocalSearchParams<{ share?: string }>();
  return <ProfilbildScreen isAustria={user?.locale === 'de-AT'} shareToken={share ?? null} />;
}
