import { lazy, Suspense } from 'react';

import { useAuthStore } from '../../stores/authStore';
import useBetaFeaturesStore from '../../stores/betaFeaturesStore';

const Home = lazy(() => import('./Startseite'));
const WorkplacePage = lazy(() => import('../../features/workplace/WorkplacePage'));

const SmartHome = () => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const workplaceEnabled = useBetaFeaturesStore((s) => !!s.betaFeatures.workplace);

  const showWorkplace = isAuthenticated && workplaceEnabled;

  return <Suspense fallback={<div />}>{showWorkplace ? <WorkplacePage /> : <Home />}</Suspense>;
};

export default SmartHome;
