import { Skeleton } from '@gruenerator/ui';
import { Suspense, lazy, useEffect, useState } from 'react';
import { Navigate, useParams, useSearchParams } from 'react-router-dom';

import PageContainer from '../../components/common/PageContainer';
import ErrorBoundary from '../../components/ErrorBoundary';
import { useAuthStore } from '../../stores/authStore';

import { resolveChatBackground } from './chatBackgrounds';
import WorkplaceChatTab from './tabs/WorkplaceChatTab';
import WorkplaceTabs, { type WorkplaceTab } from './WorkplaceTabs';

import { cn } from '@/utils/cn';
import { START_PATH, startTabLink } from '@/utils/startpage';
import { whenIdle } from '@/utils/whenIdle';

import './workplace-sunrise.css';

// `/start` mit zwei Tabs, Chat und Arbeiten — wie der WorkplacePager der App.
// Der Tab steht im Pfad (`/start/chat`, `/start/arbeiten`), damit Zurück,
// Neuladen und Lesezeichen ihn behalten. Alle drei Pfade sind ein Route-Eintrag,
// die Seite bleibt beim Wechsel also gemountet — und mit ihr beide Tabs, damit
// ein Wechsel weder den Composer-Entwurf noch die Scrollposition verliert.
// Der Wechsel ist bewusst ohne Animation.
// Arbeiten ist ein eigener Chunk, damit der Chat-Einstieg malt, ohne Office/Docs
// mitzuladen; er mountet, sobald der Browser Luft hat oder der Tab gewählt wird.
// (Wissen ist die eigenständige /wissen-Seite.)
const ArbeitenTab = lazy(() => import('./tabs/ArbeitenTab'));

const isWorkplaceTab = (value: string | null | undefined): value is WorkplaceTab =>
  value === 'chat' || value === 'arbeiten';

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
  const { tab: tabParam } = useParams();
  const [searchParams] = useSearchParams();
  const preferred = useAuthStore((s) => s.user?.default_startpage);
  const chatBackground = useAuthStore((s) => s.user?.chat_background);

  // The path names the tab; bare `/start` opens the one from the start-page setting.
  const tab: WorkplaceTab = isWorkplaceTab(tabParam) ? tabParam : (preferred ?? 'chat');

  // Arbeiten mounts once — on idle or when first shown — and then stays.
  const [arbeitenMounted, setArbeitenMounted] = useState(tab === 'arbeiten');
  if (tab === 'arbeiten' && !arbeitenMounted) setArbeitenMounted(true);

  useEffect(() => {
    if (arbeitenMounted) return;
    return whenIdle(() => setArbeitenMounted(true));
  }, [arbeitenMounted]);

  if (tabParam !== undefined && !isWorkplaceTab(tabParam)) {
    return <Navigate to={START_PATH} replace />;
  }
  // `/start?page=arbeiten` war vom 11.10.2026 an die Tab-URL; alte Links landen
  // auf dem Pfad (URLs sind F0).
  const legacyPage = searchParams.get('page');
  if (isWorkplaceTab(legacyPage)) {
    const rest = new URLSearchParams(searchParams);
    rest.delete('page');
    const search = rest.toString();
    return (
      <Navigate
        to={{ pathname: startTabLink(legacyPage), search: search && `?${search}` }}
        replace
      />
    );
  }

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
          workplace-sunrise.css) is Chat's alone; Arbeiten sits on the plain
          theme background. `invisible` rather than `hidden`: display:none
          would replay the one-shot sunrise on every switch back. */}
      <div
        aria-hidden="true"
        className={cn(
          'pointer-events-none fixed inset-0 -z-10',
          chatBackgroundClass,
          tab !== 'chat' && 'invisible'
        )}
      />
      <WorkplaceTabs active={tab} />
      <div className="flex h-full min-h-0 flex-col">
        {/* Minimal chat hero, vertically centered in the viewport (design:
            the chat panel is a flex column with justify-center). Die Tastaturhöhe
            (useMobileKeyboardOffset, gesetzt vom Composer) kürzt die Spalte, damit
            „zentriert" den sichtbaren Bereich meint und nicht den von der Tastatur
            verdeckten — `interactive-widget=resizes-visual` lässt 100dvh stehen. */}
        <div
          hidden={tab !== 'chat'}
          className={cn(
            'min-h-0 flex-1 flex-col justify-center-safe overflow-y-auto pb-[calc(6vh_+_var(--mobile-keyboard-offset,0px))] pt-16',
            tab === 'chat' && 'flex'
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
        <div hidden={tab !== 'arbeiten'} className="min-h-0 flex-1 overflow-y-auto pt-14">
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
