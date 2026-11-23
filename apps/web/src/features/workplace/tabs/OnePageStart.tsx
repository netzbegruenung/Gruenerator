import { useIsMobile } from '@gruenerator/ui';
import { type ReactNode, useEffect, useRef, useState } from 'react';

import { useAuthStore } from '../../../stores/authStore';
import { resolveChatBackground } from '../chatBackgrounds';
import ChatInner from '../components/ChatInner';
import { NavigationNewsPill } from '../components/NavigationNewsPill';
import WorkplaceGreeting from '../components/WorkplaceGreeting';

import { cn } from '@/utils/cn';

/**
 * The top of `/start` in the one-page layout (Settings → Aufbau der Startseite):
 * the chat greeting and composer, then „Zuletzt".
 *
 * Desktop: greeting and composer are centred in the window less 240 px (at
 * least 360 px), so „Zuletzt" peeks in below.
 *
 * Phones: the first screen holds greeting and composer plus the heading and one
 * and a half rows of „Zuletzt" (340 px: 44 px heading, 190 px row, 12 px gap,
 * half a row), so the cut card says there is more. The hero is the scroll
 * pane's only snap point (proximity): a short flick near the top glides back,
 * further down the page scrolls freely. Once the centred composer has scrolled
 * away, a copy docks at the bottom edge, where the thumb is.
 */
/** The chat background drops the composer's border (it stands on a tinted band there).
 *  Here it stands on the near-white page: borderless with a soft shadow it read as glass,
 *  so it gets its border back. In dark mode its fill is 5 % white, which let the halo
 *  and, when docked, the scrolling page shine through: here it is opaque, in the tone
 *  that 5 % white makes on the page background. */
const SOLID_COMPOSER =
  '[--chat-composer-border:var(--color-border)] dark:[&_form.composer-root]:bg-background-alt';

export function OnePageStart({ recents }: { recents: ReactNode }) {
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
  // The phone composer is the two-line card: on a narrow row the pill gets cramped.
  const composer = <ChatInner wide variant={isMobile ? 'card' : 'pill'} />;

  return (
    <>
      <div className="max-md:flex max-md:flex-col">
        <div
          data-tour="arbeiten-create"
          className="relative isolate flex flex-col justify-center max-md:min-h-[calc(100dvh-3rem-340px)] max-md:snap-start max-md:pb-6 md:min-h-[max(360px,calc(100dvh-240px))]"
        >
          {/* Full width: auto margins inside a flex column would shrink the hero to its content. */}
          <div className="relative isolate w-full">
            {/* A soft halo in the chat background's tint behind greeting and
                composer; text and composer sit on top of it. Centred on heading +
                composer, not on the box: the box carries 40 px of padding above the
                heading and 16 px below the composer, so the offsets differ to leave
                124 px of halo on both sides. */}
            <div
              aria-hidden="true"
              className={cn(
                chatBackgroundClass,
                'pointer-events-none absolute -top-[84px] -bottom-[108px] left-1/2 -z-10 w-[min(92vw,1320px)] -translate-x-1/2'
              )}
              style={{
                animation: 'none',
                backgroundColor: 'transparent',
                backgroundImage:
                  'radial-gradient(closest-side, rgb(var(--wp-bg-tint) / 0.28), rgb(var(--wp-bg-tint) / 0.12) 50%, transparent)',
              }}
            />
            <div className="mx-auto max-w-[820px] pt-10 max-md:pt-4 max-md:[&>div:first-child]:mb-0">
              <WorkplaceGreeting />
              {/* Phones only: „Zuletzt" waits below the fold. */}
              <p className="m-0 mt-1.5 text-center text-[15px] leading-snug text-grey-500 md:hidden dark:text-grey-400">
                Swipe oder chatte für mehr
              </p>
            </div>
            {/* Outside the greeting's 820 px box, so the composer (820 px plus its
                gutter) lines up with it. */}
            <div className={cn(chatBackgroundClass, 'contents animate-none!')}>
              <div
                ref={inlineComposerRef}
                className={cn(
                  'workplace-chat-accent mx-auto w-full max-w-[852px] px-4 max-md:mt-5',
                  SOLID_COMPOSER,
                  '[&_form.composer-root]:shadow-sm'
                )}
                data-tour="workplace-composer"
              >
                {composer}
              </div>
            </div>
            {/* Desktop: on phones the hint line above already fills that role. */}
            <div className="mt-3 flex justify-center max-md:hidden">
              <NavigationNewsPill />
            </div>
          </div>
        </div>
        <div data-tour="arbeiten-recents" className="mt-lg w-full max-md:mt-0 max-md:pb-6">
          {recents}
        </div>
      </div>

      {isMobile && (
        <div
          ref={dockedComposerRef}
          inert={!docked}
          className={cn(
            'pointer-events-none fixed inset-x-0 z-[1000] px-4 transition-[opacity,translate] duration-300 ease-out',
            docked
              ? 'translate-y-0 opacity-100 [&>*]:pointer-events-auto'
              : 'translate-y-4 opacity-0',
            'bottom-[calc(env(safe-area-inset-bottom,0px)+12px+var(--mobile-keyboard-offset,0px))]'
          )}
        >
          <div className={cn(chatBackgroundClass, 'contents animate-none!')}>
            {/* Docked over content: a deeper shadow lifts it off whatever scrolls underneath. */}
            <div
              className={cn(
                'workplace-chat-accent mx-auto w-full [&_form.composer-root]:shadow-[0_10px_32px_-8px_rgba(0,0,0,0.22),0_2px_6px_rgba(0,0,0,0.06)]',
                SOLID_COMPOSER
              )}
            >
              {composer}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
