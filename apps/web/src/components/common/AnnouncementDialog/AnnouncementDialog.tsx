import { Button, Dialog, DialogContent, DialogDescription, DialogTitle } from '@gruenerator/ui';
import { motion, MotionConfig } from 'motion/react';
import { type ReactNode, useState } from 'react';
import { HiArrowLeft, HiArrowRight, HiCheck } from 'react-icons/hi2';

import { cn } from '@/utils/cn';

/**
 * A "what's new" walkthrough: one slide at a time, a visual beside (on phones
 * above) the text, dots and arrows to move. Arrow keys and a horizontal swipe
 * also move. Phones get the whole screen. Built from the Sharepic launch dialog.
 */
export interface AnnouncementSlide {
  /** Small line above the title, e.g. „Neu im Grünerator". */
  eyebrow: string;
  title: string;
  /** Decorative: hidden from screen readers, so everything it shows must also be in `body`. */
  visual: ReactNode;
  body: ReactNode;
}

const EASE = [0.22, 1, 0.36, 1] as const;

/** Entry motion for parts of a visual, staggered by `delayMs`. Motion's
 *  transform adds to any Tailwind rotate/translate on the same element. */
export function enter(delayMs: number, from: { x?: number; y?: number; scale?: number } = {}) {
  return {
    initial: { opacity: 0, ...from },
    animate: { opacity: 1, x: 0, y: 0, scale: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.42, ease: EASE, delay: delayMs / 1000 },
  };
}

/** The slide's opening paragraph. */
export function Lead({ children }: { children: ReactNode }) {
  return <p className="m-0 text-[15px] leading-relaxed text-muted-foreground">{children}</p>;
}

/** A short list of points, each with a check. */
export function Features({ items }: { items: readonly ReactNode[] }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3 text-sm">
          <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700 dark:bg-primary-900/50 dark:text-primary-200">
            <HiCheck className="size-3.5" aria-hidden="true" />
          </span>
          <span className="leading-relaxed text-foreground">{item}</span>
        </li>
      ))}
    </ul>
  );
}

interface AnnouncementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slides: readonly AnnouncementSlide[];
  /** What the walkthrough introduces, for screen readers: „Einführung in {topic}". */
  topic: string;
}

export function AnnouncementDialog({ open, onOpenChange, slides, topic }: AnnouncementDialogProps) {
  const [index, setIndex] = useState(0);
  const slide = slides[index]!;
  const isFirst = index === 0;
  const isLast = index === slides.length - 1;
  const step = (delta: number) =>
    setIndex((i) => Math.min(slides.length - 1, Math.max(0, i + delta)));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="gap-0 overflow-hidden p-0 max-sm:top-0 max-sm:left-0 max-sm:h-dvh max-sm:max-h-dvh max-sm:max-w-full max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:border-none sm:max-w-[860px]"
        onOpenAutoFocus={() => setIndex(0)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') step(1);
          if (e.key === 'ArrowLeft') step(-1);
        }}
      >
        <MotionConfig reducedMotion="user">
          <motion.div
            className="grid h-dvh grid-rows-[auto_minmax(0,1fr)] sm:h-[min(680px,calc(100dvh-2rem))] md:h-[min(520px,calc(100dvh-2rem))] md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:grid-rows-1"
            // Swipe by touch only: with a mouse, selecting text must not change the slide.
            // pan-y leaves vertical scrolling of the text to the browser.
            style={{ touchAction: 'pan-y' }}
            onPanEnd={(event, info) => {
              if (event.pointerType !== 'touch') return;
              if (Math.abs(info.offset.x) < 50 || Math.abs(info.offset.x) < Math.abs(info.offset.y))
                return;
              step(info.offset.x < 0 ? 1 : -1);
            }}
          >
            <div
              aria-hidden="true"
              key={`visual-${index}`}
              className="relative flex h-[clamp(170px,32dvh,260px)] items-center justify-center overflow-hidden bg-primary-100 px-8 py-5 max-sm:pt-[max(1.25rem,env(safe-area-inset-top))] md:h-auto md:px-6 md:py-0 dark:bg-primary-900/40"
            >
              {slide.visual}
            </div>

            <div className="flex min-h-0 flex-col">
              <div
                key={`body-${index}`}
                role="group"
                aria-roledescription="Folie"
                aria-label={`${index + 1} von ${slides.length}`}
                className="flex flex-1 flex-col gap-4 overflow-y-auto p-5 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-right-2 sm:p-6 md:p-8"
              >
                <div className="flex flex-col gap-2 pr-6">
                  <span className="text-xs font-bold tracking-wider text-primary-600 uppercase dark:text-primary-300">
                    {slide.eyebrow}
                  </span>
                  <DialogTitle className="m-0 text-xl leading-tight font-bold sm:text-2xl">
                    {slide.title}
                  </DialogTitle>
                  <DialogDescription className="sr-only">
                    Folie {index + 1} von {slides.length} der Einführung in {topic}
                  </DialogDescription>
                </div>
                {slide.body}
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-grey-200 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-4 md:px-8 dark:border-grey-700">
                <Button
                  variant="ghost"
                  onClick={() => step(-1)}
                  className={cn(isFirst && 'invisible')}
                  aria-hidden={isFirst}
                  tabIndex={isFirst ? -1 : 0}
                >
                  <HiArrowLeft className="size-4" aria-hidden="true" />
                  Zurück
                </Button>

                <div className="flex items-center gap-1.5">
                  {slides.map((s, i) => (
                    <button
                      key={s.title}
                      type="button"
                      onClick={() => setIndex(i)}
                      aria-label={`Folie ${i + 1}: ${s.title}`}
                      aria-current={i === index ? 'step' : false}
                      className="flex size-6 items-center justify-center"
                    >
                      <span
                        className={cn(
                          'block h-2 rounded-full transition-all',
                          i === index ? 'w-5 bg-primary-600' : 'w-2 bg-grey-300 dark:bg-grey-600'
                        )}
                      />
                    </button>
                  ))}
                </div>

                <Button
                  size="lg"
                  className={cn('rounded-full', isLast && 'invisible')}
                  onClick={() => step(1)}
                  aria-hidden={isLast}
                  tabIndex={isLast ? -1 : 0}
                >
                  Weiter
                  <HiArrowRight className="size-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
          </motion.div>
        </MotionConfig>
      </DialogContent>
    </Dialog>
  );
}
