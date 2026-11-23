import { useIsMobile } from '@gruenerator/ui';
import { Suspense, lazy, useEffect, useRef, useState } from 'react';

import PageContainer from '../../../components/common/PageContainer';
import { useAuthStore } from '../../../stores/authStore';
import { resolveChatBackground } from '../chatBackgrounds';
import { AppsNewsletterSection } from '../components/AppsNewsletterSection';
import {
  BriefingSection,
  MEDIA_GRID,
  MEDIA_TOOLS,
  MarketplaceSection,
  ToolCardsSection,
} from '../components/ArbeitenSections';
import ChatInner from '../components/ChatInner';
import { InfoTilesSection } from '../components/InfoTilesSection';
import { NewContentMenu } from '../components/NewContentMenu';
import WorkplaceGreeting from '../components/WorkplaceGreeting';

import { cn } from '@/utils/cn';
// "Grünerators Favoriten" (externe Dienste) sind vorerst ausgeblendet — zum
// Reaktivieren `FavoritesSection` aus `../components/ToolsSection` importieren
// und als eigenen Abschnitt einblenden.

// Pulls image-studio Lightbox + ShareMediaModal — keep it off the tab's
// critical path.
const RecentlyCreatedSection = lazy(() => import('../components/RecentlyCreatedSection'));

// "Arbeiten": composer on top, then one column of sections on a shared grid —
// Zuletzt, Mach mehr mit deinem Grünerator, Grünerator Briefing, Marktplatz, Apps & Newsletter.
const ArbeitenTab = () => {
  // TRIAL (phones): the composer starts centred under the greeting; once it has
  // scrolled out of view, a copy docks at the bottom edge.
  const isMobile = useIsMobile();
  const inlineComposerRef = useRef<HTMLDivElement>(null);
  const dockedComposerRef = useRef<HTMLDivElement>(null);
  const [docked, setDocked] = useState(false);
  // Keep the on-screen keyboard attached: if the person is typing when the
  // composer swaps places, focus and caret move to the copy now on screen. The
  // caret is taken before the swap, because the copy that goes `inert` loses
  // focus as soon as it re-renders.
  const caretHandoff = useRef<{ start: number; end: number } | null>(null);
  useEffect(() => {
    const el = inlineComposerRef.current;
    if (!isMobile || !el) return;
    const observer = new IntersectionObserver(([entry]) => {
      const nextDocked = !entry.isIntersecting;
      const leaving = nextDocked ? inlineComposerRef.current : dockedComposerRef.current;
      const active = document.activeElement;
      caretHandoff.current =
        active instanceof HTMLTextAreaElement && leaving?.contains(active)
          ? { start: active.selectionStart, end: active.selectionEnd }
          : null;
      setDocked(nextDocked);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [isMobile]);
  useEffect(() => {
    const caret = caretHandoff.current;
    caretHandoff.current = null;
    if (!caret) return;
    const target = (docked ? dockedComposerRef : inlineComposerRef).current?.querySelector(
      'textarea'
    );
    target?.focus({ preventScroll: true });
    target?.setSelectionRange(caret.start, caret.end);
  }, [docked]);

  const chatBackgroundClass = cn(
    'workplace-chat-sunrise',
    resolveChatBackground(useAuthStore((state) => state.user?.chat_background)).className
  );
  return (
    // Phones start right under the tab bar: the greeting is hidden there (see DocsHome),
    // so „Zuletzt" sits 16 px into the scroll area, ~26 px below the tab pill.
    <PageContainer maxWidth="lg" noPadTop gradient={false} className="max-md:pt-0">
      {/* TRIAL: the chat composer under the greeting instead of the search field. */}
      {/* TRIAL: the composer owns the first view: the window height less 240 px
          (at least 360 px), greeting and composer centred, „Zuletzt" peeks in below.
          Phones: the first screen holds greeting and composer plus the heading and
          one and a half rows of „Zuletzt" (340 px: 44 px heading, 190 px row,
          12 px gap, half a row), so the cut card says there is more. The hero
          is the only snap point (proximity): a short flick near the top glides back,
          further down the page scrolls freely. */}
      <div className="max-md:flex max-md:flex-col">
        <div
          data-tour="arbeiten-create"
          className="relative isolate flex flex-col justify-center max-md:min-h-[calc(100dvh-3rem-340px)] max-md:snap-start max-md:pb-6 md:min-h-[max(360px,calc(100dvh-240px))]"
        >
          {/* Full width: auto margins inside a flex column would shrink the hero to its content. */}
          <div className="relative isolate w-full">
            {/* TRIAL: a soft halo in the chat background's tint behind greeting and
              composer, centred on both; text and composer sit on top of it. */}
            <div
              aria-hidden="true"
              className={cn(
                chatBackgroundClass,
                // Centred on heading + composer, not on the box: the box carries 40 px of hero
                // padding above the heading and 16 px below the composer, so the offsets
                // differ to leave 124 px of halo on both sides.
                'pointer-events-none absolute -top-[84px] -bottom-[108px] left-1/2 -z-10 w-[min(92vw,1320px)] -translate-x-1/2'
              )}
              style={{
                animation: 'none',
                backgroundColor: 'transparent',
                backgroundImage:
                  'radial-gradient(closest-side, rgb(var(--wp-bg-tint) / 0.28), rgb(var(--wp-bg-tint) / 0.12) 50%, transparent)',
              }}
            />
            {/* TRIAL: the chat page's greeting as is (36 px, 24 px on phones, pride
              gradient). pt-10 / max-md:pt-4 keep the hero's old top space, which
              the halo offsets above are measured against. */}
            <div className="mx-auto max-w-[820px] pt-10 max-md:pt-4 max-md:[&>div:first-child]:mb-0">
              <WorkplaceGreeting />
              {/* TRIAL: phone only, the hint that "Zuletzt" waits below the fold. */}
              <p className="m-0 mt-1.5 text-center text-[15px] leading-snug text-grey-500 md:hidden dark:text-grey-400">
                Swipe oder chatte für mehr
              </p>
            </div>
            {/* TRIAL: outside the hero (its box caps at 860 px), so the composer can be
              820 px wide. */}
            <div className={cn(chatBackgroundClass, 'contents animate-none!')}>
              <div
                ref={inlineComposerRef}
                className="workplace-chat-accent mx-auto w-full max-w-[852px] px-4 max-md:mt-5"
                data-tour="workplace-composer"
              >
                <ChatInner wide variant={isMobile ? 'card' : 'pill'} />
              </div>
            </div>
          </div>
        </div>
        <div data-tour="arbeiten-recents" className="mt-lg w-full max-md:mt-0 max-md:pb-6">
          <Suspense fallback={null}>
            <RecentlyCreatedSection headerAction={<NewContentMenu />} />
          </Suspense>
        </div>
      </div>

      <div className="mt-10 flex flex-col gap-10 pb-2xl max-md:mt-0 max-md:pt-6 max-md:pb-32 md:mt-12 md:gap-12 lg:mt-14 lg:gap-14">
        <ToolCardsSection
          title="Mach mehr mit deinem Grünerator"
          tools={MEDIA_TOOLS}
          gridClassName={MEDIA_GRID}
          data-tour="arbeiten-tools"
        />
        <BriefingSection />
        <MarketplaceSection />
        <AppsNewsletterSection />
        <InfoTilesSection />
      </div>
      {isMobile && (
        <div
          ref={dockedComposerRef}
          inert={!docked}
          className={cn(
            // Docks once the centred composer has left the view; „Zuletzt" runs on behind it.
            'pointer-events-none fixed inset-x-0 z-[1000] px-4 transition-[opacity,translate] duration-300 ease-out',
            docked
              ? 'translate-y-0 opacity-100 [&>*]:pointer-events-auto'
              : 'translate-y-4 opacity-0',
            'bottom-[calc(env(safe-area-inset-bottom,0px)+12px+var(--mobile-keyboard-offset,0px))]'
          )}
        >
          <div className={cn(chatBackgroundClass, 'contents animate-none!')}>
            {/* Docked over content: a deeper shadow, no border,
                lift it off whatever scrolls underneath. */}
            <div
              className={cn(
                'workplace-chat-accent mx-auto w-full',
                '[&_form.composer-root]:shadow-[0_10px_32px_-8px_rgba(0,0,0,0.22),0_2px_6px_rgba(0,0,0,0.06)]'
              )}
            >
              <ChatInner wide variant={isMobile ? 'card' : 'pill'} />
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
};

export default ArbeitenTab;
