import { lazy, Suspense } from 'react';

import { useAuthStore } from '../../stores/authStore';

const Home = lazy(() => import('./Startseite'));
const WorkplacePage = lazy(() => import('../../features/workplace/WorkplacePage'));

const SmartHome = () => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return <Suspense fallback={<div />}>{isAuthenticated ? <WorkplacePage /> : <Home />}</Suspense>;
};

export default SmartHome;
