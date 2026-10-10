import { useAuth } from '@gruenerator/shared/hooks';

import { ProfilbildScreen } from '../../components/profilbild/ProfilbildScreen';

export default function ProfilbildRoute() {
  const { user } = useAuth();
  return <ProfilbildScreen isAustria={user?.locale === 'de-AT'} />;
}
