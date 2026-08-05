import { Suspense, lazy } from 'react';
import { useLocation } from 'react-router-dom';

import ErrorBoundary from '../../components/ErrorBoundary';
import { useAuthStore } from '../../stores/authStore';

import { resolveChatBackground } from './chatBackgrounds';
import WorkplaceChatTab from './tabs/WorkplaceChatTab';
import WorkplaceTabs, { workplaceTabFromPathname } from './WorkplaceTabs';

import { cn } from '@/utils/cn';

import './workplace-sunrise.css';

// Each tab is its own chunk so the default Chat tab paints without pulling
// office/docs into its bundle. (Wissen is now a standalone /wissen page.)
const ArbeitenTab = lazy(() => import('./tabs/ArbeitenTab'));

// Arbeiten mirrors the (weakened) notebook radial gradient, green-tinted.
const WORKPLACE_GREEN_BG = cn(
  'bg-[image:radial-gradient(ellipse_55%_45%_at_50%_50%,#EAF4EE_0%,#F5FAF7_55%,#FFFFFF_100%)]',
  'dark:bg-[image:radial-gradient(ellipse_55%_45%_at_50%_50%,#12241A_0%,#101812_55%,#0C120D_100%)]'
);

// Per-tab page tints from the design. Chat gets the radial glow behind the
// centered hero — hue picked by the user in /profile/aussehen, light + dark
// handled in workplace-sunrise.css; Arbeiten a faint green radial.
const TAB_BACKGROUND: Record<string, string> = {
  arbeiten: WORKPLACE_GREEN_BG,
};

const WorkplacePage = () => {
  const { pathname } = useLocation();
  const tab = workplaceTabFromPathname(pathname);
  const chatBackground = useAuthStore((s) => s.user?.chat_background);

  const chatBackgroundClass = cn(
    'workplace-chat-sunrise',
    resolveChatBackground(chatBackground).className
  );

  const backgroundClass = tab === 'chat' ? chatBackgroundClass : TAB_BACKGROUND[tab];

  return (
    <ErrorBoundary>
      {/* Paints the full viewport instead of only the area right of the
          sidebar. The sidebar is `position: fixed` and translucent, so it
          used to float over flat theme background here while the gradient
          started abruptly at its right edge — a hard seam that also moved
          on hover-expand. Layering the paint behind everything lets the
          sidebar's own blur blend it instead. */}
      <div
        aria-hidden="true"
        className={cn('pointer-events-none fixed inset-0 -z-10', backgroundClass)}
      />
      <WorkplaceTabs active={tab} />
      <div
        className={cn(
          'flex h-full min-h-0 flex-col',
          // Kept (not dropped) for --wp-accent / --wp-accent-hover /
          // --chat-composer-border, which the composer further down the tree
          // reads via inheritance (workplace-chat-accent, chat-thread-glow).
          // Its own paint is neutralized — the fixed layer above owns it now.
          // animate-none! stops the (now invisible) entrance animation from
          // running a second time in parallel with the fixed layer's.
          backgroundClass,
          'bg-transparent! bg-none! animate-none!'
        )}
      >
        {tab === 'chat' ? (
          // Minimal chat hero, vertically centered in the viewport (design:
          // the chat panel is a flex column with justify-center).
          <div className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto pb-[6vh] pt-16">
            <WorkplaceChatTab />
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
