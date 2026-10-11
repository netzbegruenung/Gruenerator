import { Skeleton } from '@gruenerator/ui';
import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import PageContainer from '../../components/common/PageContainer';
import ErrorBoundary from '../../components/ErrorBoundary';
import { useAuthStore } from '../../stores/authStore';

import { resolveChatBackground } from './chatBackgrounds';
import WorkplaceChatTab from './tabs/WorkplaceChatTab';
import WorkplaceTabs, { WORKPLACE_TABS_LAYOUT_ID, type WorkplaceTab } from './WorkplaceTabs';

import { glassTabIds } from '@/components/common/GlassTabBar';
import { cn } from '@/utils/cn';
import { whenIdle } from '@/utils/whenIdle';

import './workplace-sunrise.css';

// `/start` mit zwei Tabs, Chat und Arbeiten — wie der WorkplacePager der App.
// Beide bleiben gemountet, damit ein Wechsel weder den Composer-Entwurf noch die
// Scrollposition verliert und Pill, Hintergrund und Inhalt animieren können.
// Arbeiten ist ein eigener Chunk, damit der Chat-Einstieg malt, ohne Office/Docs
// mitzuladen; er mountet, sobald der Browser Luft hat oder der Tab gewählt wird.
// (Wissen ist die eigenständige /wissen-Seite.)
const ArbeitenTab = lazy(() => import('./tabs/ArbeitenTab'));

// Arbeiten mirrors the (weakened) notebook radial gradient, green-tinted.
const WORKPLACE_GREEN_BG = cn(
  'bg-[image:radial-gradient(ellipse_55%_45%_at_50%_50%,#EAF4EE_0%,#F5FAF7_55%,#FFFFFF_100%)]',
  'dark:bg-[image:radial-gradient(ellipse_55%_45%_at_50%_50%,#12241A_0%,#101812_55%,#0C120D_100%)]'
);

const isWorkplaceTab = (value: string | null): value is WorkplaceTab =>
  value === 'chat' || value === 'arbeiten';

const tabIds = (tab: WorkplaceTab) => glassTabIds(WORKPLACE_TABS_LAYOUT_ID, tab);

// Stands in for Arbeiten only while its chunk loads after an explicit switch;
// the idle mount usually has it ready before anyone clicks.
const ArbeitenFallback = () => (
  <PageContainer maxWidth="lg" noPadTop gradient={false} className="max-md:pt-lg">
    <div aria-busy="true" className="flex flex-col gap-md">
      <Skeleton className="mx-auto h-14 w-full max-w-3xl rounded-2xl" />
      <Skeleton className="h-28 w-full rounded-2xl" />
      <Skeleton className="h-48 w-full rounded-2xl" />
    </div>
  </PageContainer>
);

const WorkplacePage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get('page');
  const preferred = useAuthStore((s) => s.user?.default_startpage);
  const chatBackground = useAuthStore((s) => s.user?.chat_background);

  // `?page=` (a link into a tab) beats the start-page setting, which beats Chat.
  const [tab, setTab] = useState<WorkplaceTab>(() =>
    isWorkplaceTab(requested) ? requested : (preferred ?? 'chat')
  );
  // Entrance animations only after a switch, never on the first paint.
  const [switched, setSwitched] = useState(false);
  const [arbeitenMounted, setArbeitenMounted] = useState(tab === 'arbeiten');

  const selectTab = useCallback(
    (next: WorkplaceTab) => {
      if (next === tab) return;
      if (next === 'arbeiten') setArbeitenMounted(true);
      setTab(next);
      setSwitched(true);
    },
    [tab]
  );

  // A link into a tab while the page is already open (the tour does this).
  // Adjusted during render so the tab shows in the same commit.
  if (isWorkplaceTab(requested) && requested !== tab) {
    setTab(requested);
    setSwitched(true);
    if (requested === 'arbeiten') setArbeitenMounted(true);
  }

  // The param has done its job; clearing it keeps the URL at `/start` and lets
  // the same link work again after the user switched away.
  useEffect(() => {
    if (requested === null) return;
    setSearchParams(
      (params) => {
        params.delete('page');
        return params;
      },
      { replace: true }
    );
  }, [requested, setSearchParams]);

  useEffect(() => {
    if (arbeitenMounted) return;
    return whenIdle(() => setArbeitenMounted(true));
  }, [arbeitenMounted]);

  const chatBackgroundClass = cn(
    'workplace-chat-sunrise',
    resolveChatBackground(chatBackground).className
  );

  return (
    <ErrorBoundary>
      {/* Paints the full viewport instead of only the area right of the
          sidebar. The sidebar is `position: fixed` and translucent, so it
          used to float over flat theme background here while the gradient
          started abruptly at its right edge — a hard seam that also moved
          on hover-expand. Layering the paint behind everything lets the
          sidebar's own blur blend it instead.
          Chat's glow (hue picked in the settings, light + dark in
          workplace-sunrise.css) always sits underneath; Arbeiten's faint green
          radial fades in over it, so a switch crossfades the two. */}
      <div
        aria-hidden="true"
        className={cn('pointer-events-none fixed inset-0 -z-10', chatBackgroundClass)}
      />
      <div
        aria-hidden="true"
        className={cn(
          'pointer-events-none fixed inset-0 -z-10 transition-opacity duration-300 ease-out motion-reduce:transition-none',
          WORKPLACE_GREEN_BG,
          tab === 'arbeiten' ? 'opacity-100' : 'opacity-0'
        )}
      />
      <WorkplaceTabs active={tab} onSelect={selectTab} />
      <div className="flex h-full min-h-0 flex-col">
        {/* Minimal chat hero, vertically centered in the viewport (design:
            the chat panel is a flex column with justify-center). Die Tastaturhöhe
            (useMobileKeyboardOffset, gesetzt vom Composer) kürzt die Spalte, damit
            „zentriert" den sichtbaren Bereich meint und nicht den von der Tastatur
            verdeckten — `interactive-widget=resizes-visual` lässt 100dvh stehen. */}
        <div
          id={tabIds('chat').panel}
          role="tabpanel"
          aria-labelledby={tabIds('chat').tab}
          hidden={tab !== 'chat'}
          className={cn(
            'min-h-0 flex-1 flex-col justify-center-safe overflow-y-auto pb-[calc(6vh_+_var(--mobile-keyboard-offset,0px))] pt-16',
            tab === 'chat' && 'flex',
            switched && 'workplace-panel-in-left'
          )}
        >
          {/* Carries --wp-accent / --wp-accent-hover / --chat-composer-border,
              which the composer reads via inheritance (workplace-chat-accent,
              chat-thread-glow). `contents` keeps it out of the layout; its paint
              and entrance animation belong to the fixed layer above. */}
          <div className={cn(chatBackgroundClass, 'contents animate-none!')}>
            <WorkplaceChatTab />
          </div>
        </div>
        <div
          id={tabIds('arbeiten').panel}
          role="tabpanel"
          aria-labelledby={tabIds('arbeiten').tab}
          hidden={tab !== 'arbeiten'}
          className={cn(
            'min-h-0 flex-1 overflow-y-auto pt-14',
            switched && 'workplace-panel-in-right'
          )}
        >
          {arbeitenMounted && (
            <Suspense fallback={<ArbeitenFallback />}>
              <ArbeitenTab />
            </Suspense>
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default WorkplacePage;
