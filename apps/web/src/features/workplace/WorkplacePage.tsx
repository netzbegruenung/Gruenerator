import { Suspense, lazy } from 'react';
import { useLocation } from 'react-router-dom';

import ErrorBoundary from '../../components/ErrorBoundary';

import WorkplaceChatTab from './tabs/WorkplaceChatTab';
import WorkplaceTabs, { workplaceTabFromPathname } from './WorkplaceTabs';

// Each tab is its own chunk so the default Chat tab paints without pulling
// office/docs or the notebook chat surface.
const ArbeitenTab = lazy(() => import('./tabs/ArbeitenTab'));
const WissenTab = lazy(() => import('./tabs/WissenTab'));

const WorkplacePage = () => {
  const { pathname } = useLocation();
  const tab = workplaceTabFromPathname(pathname);

  // Wissen embeds the notebook chat surface, which sizes itself against a
  // bounded parent — give it the full-height flex chain (sidebarOnly layout
  // provides an h-dvh app content column).
  if (tab === 'wissen') {
    return (
      <ErrorBoundary>
        <div className="flex h-full min-h-0 flex-col">
          <WorkplaceTabs active="wissen" className="shrink-0" />
          <div className="min-h-0 flex-1">
            <Suspense fallback={null}>
              <WissenTab />
            </Suspense>
          </div>
        </div>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <WorkplaceTabs active={tab} />
      {tab === 'chat' ? (
        <WorkplaceChatTab />
      ) : (
        <Suspense fallback={null}>
          <ArbeitenTab />
        </Suspense>
      )}
    </ErrorBoundary>
  );
};

export default WorkplacePage;
