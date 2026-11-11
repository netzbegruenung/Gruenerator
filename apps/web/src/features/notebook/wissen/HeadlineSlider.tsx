import { cn } from '@gruenerator/ui';
import { Pause, Play } from 'lucide-react';
import { memo } from 'react';
import { Link } from 'react-router-dom';

import { ASIDE_TITLE, ASIDE_TITLE_LINK, SLIDER_HEAD, SliderCard } from './WissenLayout';
import { SliderSkeleton } from './WissenSkeletons';

import type { WissenArticle } from './useWissenNews';

import { DASH_FOCUS, DASH_HEADING, DASH_MUTED } from '@/components/dashboard/dashboardStyles';
import { NewsMeta } from '@/components/dashboard/NewsMeta';
import { SlideDots, SlideStatus, useAutoAdvance } from '@/components/dashboard/slides';

/** So lange steht eine Folie, bevor die nächste kommt (Entwurf: 6 s). */
export const SLIDE_INTERVAL_MS = 6000;

interface HeadlineSliderProps {
  items: WissenArticle[];
  loading: boolean;
  /** Überschrift der Karte; auf /wissen „Briefing", eingebettet auf Arbeiten „Nachrichten". */
  title?: string;
  /** Ziel der Überschrift: die Seite mit allen Meldungen (/briefing). */
  to: string;
}

/** Überschrift und Name der Region — wie „Trends" und „Umfragen" ein Link auf die volle Seite. */
export const SLIDER_TITLE = 'Briefing';

// `memo`: die Überschrift ändert sich beim Folienwechsel nicht.
const SliderTitle = memo(function SliderTitle({ to, title }: { to: string; title: string }) {
  return (
    <h2 className={cn(ASIDE_TITLE, SLIDER_HEAD)}>
      <Link to={to} className={ASIDE_TITLE_LINK}>
        {title}
      </Link>
    </h2>
  );
});

/**
 * Eine Folie. `memo`: beim Wechsel ändern sich nur `active` der alten und der
 * neuen Folie — die übrigen bleiben unberührt. (React Compiler läuft nur im
 * Build und memoisiert keine einzelnen Einträge einer `map`.)
 */
const HeadlineSlide = memo(function HeadlineSlide({
  article: a,
  position,
  active,
}: {
  article: WissenArticle;
  /** z. B. „2 von 6" — zugänglicher Name der Folie. */
  position: string;
  active: boolean;
}) {
  return (
    <article
      aria-roledescription="Folie"
      aria-label={position}
      inert={!active}
      className="box-border flex flex-[0_0_100%] flex-col gap-2 px-[18px] pb-1 pt-2.5 max-md:gap-1.5 md:px-[26px] md:pb-2 md:pt-3 lg:px-8 lg:pb-3 lg:pt-3.5 @3xl:grid @3xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] @3xl:items-end @3xl:gap-8"
    >
      <div className="flex flex-col gap-1.5 md:gap-2">
        <NewsMeta source={a.source} time={a.time} />
        <h3
          className={cn(
            'm-0 text-[19px] leading-[1.28] [text-wrap:pretty] max-md:line-clamp-3 md:text-2xl md:leading-[1.22] lg:text-[28px] lg:leading-[1.2]',
            DASH_HEADING
          )}
        >
          <a
            href={a.href}
            target="_blank"
            rel="noreferrer"
            className={cn('rounded text-inherit no-underline hover:underline', DASH_FOCUS)}
          >
            {a.title}
          </a>
        </h3>
      </div>
      {a.text && (
        <p className="m-0 hidden text-[15px] leading-[1.55] text-foreground [text-wrap:pretty] md:line-clamp-3 lg:leading-[1.6] @3xl:line-clamp-4">
          {a.text}
        </p>
      )}
    </article>
  );
});

/** Pause/Weiter — WCAG 2.2.2. `memo`: ändert sich nur, wenn jemand ihn drückt. */
const PlayButton = memo(function PlayButton({
  playing,
  onToggle,
}: {
  playing: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={playing ? 'Durchwechseln anhalten' : 'Durchwechseln fortsetzen'}
      className={cn(
        'ml-auto flex size-8 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 text-muted-foreground hover:text-(--dash-mg)',
        DASH_FOCUS
      )}
    >
      {playing ? <Pause aria-hidden className="size-4" /> : <Play aria-hidden className="size-4" />}
    </button>
  );
});

/**
 * Folien, Punkte und Pause-Knopf mit dem Folienstand. Er liegt hier statt im
 * Slider, damit Karte und Überschrift beim Wechsel nicht mitrendern; Wischen
 * und Anhalten per Mauszeiger/Fokus gelten deshalb für Folien und Fußzeile.
 */
function SliderBody({ items }: { items: WissenArticle[] }) {
  const { active, select, playing, togglePlaying, announced, containerProps } = useAutoAdvance(
    items.length,
    SLIDE_INTERVAL_MS
  );
  return (
    <div {...containerProps} className="flex flex-col">
      <div
        className="flex transition-transform duration-[900ms] ease-[cubic-bezier(.4,0,.2,1)] motion-reduce:transition-none"
        style={{ transform: `translateX(-${active * 100}%)` }}
      >
        {items.map((a, i) => (
          <HeadlineSlide
            key={a.key}
            article={a}
            position={`${i + 1} von ${items.length}`}
            active={i === active}
          />
        ))}
      </div>
      <div className="flex items-center gap-2 px-[18px] pb-3 pt-2 md:px-[26px] md:pb-5 md:pt-3 lg:px-8 lg:pb-[22px]">
        <SlideDots
          labels={items.map((_, i) => `Meldung ${i + 1} von ${items.length}`)}
          active={active}
          onSelect={select}
        />
        <SlideStatus text={announced === null ? null : (items[announced]?.title ?? null)} />
        {items.length > 1 && <PlayButton playing={playing} onToggle={togglePlaying} />}
      </div>
    </div>
  );
}

export function HeadlineSlider({ items, loading, to, title = SLIDER_TITLE }: HeadlineSliderProps) {
  if (items.length === 0) {
    return (
      <SliderCard aria-label={title} aria-busy={loading}>
        <SliderTitle to={to} title={title} />
        {loading ? (
          <SliderSkeleton />
        ) : (
          <p className={cn('m-0 px-[18px] pb-6 pt-3 md:px-[26px] lg:px-8', DASH_MUTED)}>
            Gerade keine neuen Schlagzeilen.
          </p>
        )}
      </SliderCard>
    );
  }

  return (
    <SliderCard aria-roledescription="Karussell" aria-label={title}>
      <SliderTitle to={to} title={title} />
      <SliderBody items={items} />
    </SliderCard>
  );
}
