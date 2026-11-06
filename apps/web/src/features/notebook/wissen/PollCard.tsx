import { cn } from '@gruenerator/ui';
import { Link } from 'react-router-dom';

import { usePolls } from '../../monitor/hooks/useMonitor';
import { deltaText, grueneSnapshot, isGruene, pct } from '../../monitor/pollFormat';

import { ASIDE_TITLE, AsideCard } from './WissenLayout';
import { PollSkeleton } from './WissenSkeletons';
import { WD_ACCENT_TEXT, WD_DISPLAY, WD_HEADING, WD_MUTED } from './wissenStyles';

import type { MonitorLocale } from '@gruenerator/contracts';

/** Verlauf als Linie; die Strichstärke bleibt beim Strecken konstant. */
export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  const s = values.slice(-12);
  if (s.length < 2) return null;
  const min = Math.min(...s);
  const range = Math.max(...s) - min || 1;
  // viewBox 300×56 wie im Entwurf; 6 px Luft oben und unten.
  const points = s.map((v, i) => `${(i * 300) / (s.length - 1)},${50 - ((v - min) / range) * 44}`);
  return (
    <svg viewBox="0 0 300 56" preserveAspectRatio="none" aria-hidden className={className}>
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke="var(--wd-mg)"
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/**
 * „Umfragen": Mittel der Sonntagsfrage, Abstand zur Vorwoche, Verlauf und
 * die drei stärksten anderen Parteien. Ein Raster für alle Größen — auf dem
 * Tablet stehen Zahl und Parteien nebeneinander, auf dem Desktop untereinander
 * (die Reihenfolge ordnet `xl:order-*`), auf dem Smartphone entfallen die Parteien.
 */
export function PollCard({ locale, to }: { locale: MonitorLocale; to: string }) {
  const { data, isPending } = usePolls(locale === 'at' ? 'oesterreich' : 'deutschland');
  // In einer leeren 200-Antwort fehlen `average`/`polls` (Teilausfall).
  const g = data?.average && data.polls ? grueneSnapshot(data) : null;
  const others = Object.entries(data?.average ?? {})
    .filter(([party]) => !isGruene(party))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  const delta = g?.delta ? deltaText(g.delta) : '';

  return (
    <AsideCard
      aria-label="Umfragen"
      aria-busy={isPending}
      className="md:grid md:grid-cols-[auto_minmax(0,1fr)] md:items-end md:gap-x-5 md:gap-y-2 xl:flex xl:items-stretch"
    >
      <h2 className={cn(ASIDE_TITLE, 'md:col-span-2')}>
        <Link to={to} className="text-inherit no-underline hover:underline">
          Umfragen
        </Link>
      </h2>
      {g?.value != null ? (
        <>
          <div className="flex flex-col gap-0.5 xl:flex-row xl:items-baseline xl:gap-2.5">
            <span
              className={cn(
                'text-[32px] font-bold leading-[1.05] md:text-[40px] xl:text-5xl',
                WD_DISPLAY,
                WD_HEADING
              )}
            >
              {pct(g.value)}
            </span>
            {delta && (
              <span className={cn('text-[13px] font-bold md:text-sm xl:text-base', WD_ACCENT_TEXT)}>
                {delta}
                <span className="xl:hidden"> zur Vorwoche</span>
              </span>
            )}
          </div>
          {others.length > 0 && (
            <ul className="m-0 flex list-none flex-col gap-1 p-0 max-md:hidden xl:order-3 xl:gap-1.5">
              {others.map(([party, value]) => (
                <li
                  key={party}
                  className="flex justify-between gap-2 text-sm text-foreground xl:text-base"
                >
                  <span>{party}</span>
                  <span className="font-bold">{pct(value)}</span>
                </li>
              ))}
            </ul>
          )}
          <Sparkline
            values={g.trend.map((p) => p.value)}
            className="mt-auto h-[34px] w-full md:col-span-2 md:mt-1.5 md:h-10 xl:order-2 xl:mt-0 xl:h-auto xl:max-h-[90px] xl:min-h-6 xl:flex-[1_1_40px]"
          />
        </>
      ) : isPending ? (
        <PollSkeleton />
      ) : (
        <p className={cn('m-0 text-sm md:col-span-2', WD_MUTED)}>Gerade keine Umfragewerte.</p>
      )}
    </AsideCard>
  );
}
