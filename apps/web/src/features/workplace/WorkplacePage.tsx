import { Suspense, lazy } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import ErrorBoundary from '../../components/ErrorBoundary';
import { useAuthStore } from '../../stores/authStore';
import { NOTEBOOK_MAGENTA_BG } from '../notebook/components/NotebookStartpage';
import { useTourAutostart } from '../tours/useTourAutostart';

import WorkplaceChatTab from './tabs/WorkplaceChatTab';
import WorkplaceTabs, { workplaceTabFromPathname } from './WorkplaceTabs';

import { cn } from '@/utils/cn';

import './workplace-sunrise.css';

// Each tab is its own chunk so the default Chat tab paints without pulling
// office/docs or the notebook chat surface.
const ArbeitenTab = lazy(() => import('./tabs/ArbeitenTab'));
const WissenTab = lazy(() => import('./tabs/WissenTab'));

// Per-tab page tints from the design (light mode only; dark keeps the theme
// background). Chat gets the warm radial glow behind the centered hero.
const TAB_BACKGROUND: Record<string, string> = {
  chat: 'workplace-chat-sunrise dark:bg-transparent',
  arbeiten: 'bg-[#F7FBF8] dark:bg-transparent',
  // "Wissen" adopts the notebook 2a magenta radial as a full-page surface.
  wissen: NOTEBOOK_MAGENTA_BG,
};

const WorkplacePage = () => {
  const { pathname } = useLocation();
  const tab = workplaceTabFromPathname(pathname);
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  useTourAutostart('workplace', tab === 'chat' && !!user, () => {
    void import('../tours/workplaceTour').then((m) =>
      m.startWorkplaceTour((path) => void navigate(path))
    );
  });

  return (
    <ErrorBoundary>
      <WorkplaceTabs active={tab} />
      <div className={cn('flex h-full min-h-0 flex-col', TAB_BACKGROUND[tab])}>
        {tab === 'chat' ? (
          // Minimal chat hero, vertically centered in the viewport (design:
          // the chat panel is a flex column with justify-center).
          <div className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto pb-[6vh] pt-16">
            <WorkplaceChatTab />
          </div>
        ) : tab === 'wissen' ? (
          // The notebook chat surface sizes itself against a bounded parent —
          // full-height flex chain (sidebarOnly layout provides h-dvh).
          <div className="min-h-0 flex-1 pt-14" data-tour="wissen">
            <Suspense fallback={null}>
              <WissenTab />
            </Suspense>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto pt-14">
            <Suspense fallback={null}>
              <ArbeitenTab />
            </Suspense>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
};

export default WorkplacePage;
