import { cn } from '@gruenerator/ui';
import { useEffect, useState, type FocusEvent } from 'react';
import { Link } from 'react-router-dom';

import { SliderCard } from './WissenLayout';
import { SliderSkeleton } from './WissenSkeletons';
import { WD_FOCUS, WD_HEADING, WD_LINK, WD_MUTED } from './wissenStyles';

import type { WissenArticle } from './useWissenNews';

/** So lange steht eine Folie, bevor die nächste kommt (Entwurf: 6 s). */
export const SLIDE_INTERVAL_MS = 6000;

const reducedMotionQuery = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Wechselt alle `intervalMs` zur nächsten Folie — außer der Mauszeiger oder der
 * Fokus steht darin, jemand hat einen Punkt gewählt (dann bleibt die Folie),
 * oder das System wünscht weniger Bewegung.
 */
function useAutoAdvance(count: number, intervalMs: number) {
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [stopped, setStopped] = useState(reducedMotionQuery);

  useEffect(() => {
    if (stopped || hovered || focused || count < 2) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), intervalMs);
    return () => clearInterval(timer);
  }, [stopped, hovered, focused, count, intervalMs]);

  return {
    // Kommen weniger Folien als vorher, bleibt der Index gültig.
    active: count > 0 ? index % count : 0,
    select: (i: number) => {
      setStopped(true);
      setIndex(i);
    },
    containerProps: {
      onMouseEnter: () => setHovered(true),
      onMouseLeave: () => setHovered(false),
      onFocus: () => setFocused(true),
      onBlur: (e: FocusEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false);
      },
    },
  };
}

interface HeadlineSliderProps {
  items: WissenArticle[];
  loading: boolean;
  /** Links unten rechts im Slider zu den vollen Seiten (Watcher, Feed). */
  moreLinks: { label: string; to: string }[];
}

export function HeadlineSlider({ items, loading, moreLinks }: HeadlineSliderProps) {
  const { active, select, containerProps } = useAutoAdvance(items.length, SLIDE_INTERVAL_MS);

  if (items.length === 0) {
    return (
      <SliderCard aria-label="Schlagzeilen" aria-busy={loading}>
        {loading ? (
          <SliderSkeleton />
        ) : (
          <p className={cn('m-0 px-[18px] py-6 md:px-[26px] lg:px-8', WD_MUTED)}>
            Gerade keine neuen Schlagzeilen.
          </p>
        )}
      </SliderCard>
    );
  }

  return (
    <SliderCard aria-roledescription="Karussell" aria-label="Schlagzeilen" {...containerProps}>
      <div
        className="flex transition-transform duration-[900ms] ease-[cubic-bezier(.4,0,.2,1)] motion-reduce:transition-none"
        style={{ transform: `translateX(-${active * 100}%)` }}
      >
        {items.map((a, i) => (
          <article
            key={a.key}
            aria-roledescription="Folie"
            aria-label={`${i + 1} von ${items.length}`}
            inert={i !== active}
            className="box-border flex flex-[0_0_100%] flex-col gap-2 px-[18px] pb-1 pt-4 max-md:gap-1.5 md:px-[26px] md:pb-2 md:pt-6 lg:px-8 lg:pb-3 lg:pt-7 @3xl:grid @3xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] @3xl:items-end @3xl:gap-8"
          >
            <div className="flex flex-col gap-1.5 md:gap-2">
              <span className={cn('text-[13px]', WD_MUTED)}>
                {a.kind} · {[a.source, a.time].filter(Boolean).join(' · ')}
              </span>
              <h3
                className={cn(
                  'm-0 text-[19px] leading-[1.28] [text-wrap:pretty] max-md:line-clamp-3 md:text-2xl md:leading-[1.22] lg:text-[28px] lg:leading-[1.2]',
                  WD_HEADING
                )}
              >
                <a
                  href={a.href}
                  target="_blank"
                  rel="noreferrer"
                  className={cn('rounded text-inherit no-underline hover:underline', WD_FOCUS)}
                >
                  {a.title}
                </a>
              </h3>
            </div>
            {a.text && (
              <p className="m-0 hidden text-[15px] leading-[1.55] text-foreground [text-wrap:pretty] md:line-clamp-2 lg:leading-[1.6] @3xl:line-clamp-none">
                {a.text}
              </p>
            )}
          </article>
        ))}
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-border pb-1 pl-[18px] pr-2 pt-0.5 md:mt-0 md:border-0 md:px-[26px] md:pb-5 md:pt-3 lg:px-8 lg:pb-[22px]">
        <div className="flex">
          {items.map((a, i) => (
            <button
              key={a.key}
              type="button"
              onClick={() => select(i)}
              aria-label={`Meldung ${i + 1} von ${items.length}`}
              aria-current={i === active}
              className={cn('flex h-6 items-center px-[3px] first:pl-0', WD_FOCUS)}
            >
              <span
                className={cn(
                  'block h-2 rounded-full transition-all duration-300 motion-reduce:transition-none',
                  i === active ? 'w-[22px] bg-(--wd-mg)' : 'w-2 bg-(--wd-mg-dot)'
                )}
              />
            </button>
          ))}
        </div>
        <div className="flex">
          {moreLinks.map((l) => (
            <Link key={l.to} to={l.to} className={cn('px-2.5 py-3 text-[15px]', WD_LINK)}>
              {l.label}
            </Link>
          ))}
        </div>
      </div>
    </SliderCard>
  );
}
