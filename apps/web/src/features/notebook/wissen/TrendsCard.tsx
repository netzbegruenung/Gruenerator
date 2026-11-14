import { cn } from '@gruenerator/ui';
import { Link } from 'react-router-dom';

import { useMonitorSnapshot } from '../../monitor/hooks/useMonitor';

import { ASIDE_TITLE, ASIDE_TITLE_LINK, AsideCard } from './WissenLayout';
import { TrendsSkeleton } from './WissenSkeletons';

import type { MonitorLocale } from '@gruenerator/contracts';

import { DASH_MUTED } from '@/components/dashboard/dashboardStyles';
import { SlideStack, type Slide } from '@/components/dashboard/slides';

const TREND_COUNT = 4;
/** Ein Balken bleibt sichtbar, auch wenn das Thema weit hinter dem ersten liegt. */
const MIN_BAR_PCT = 8;

const X_TREND_COUNT = 6;

/**
 * „Trends" in zwei Folien zum Wischen (oder über die Punkte), ohne Durchwechseln:
 * die meistgenannten Schlagwörter der letzten 24 Stunden mit Balken
 * (Smartphone: drei), dann die X-Trends des Landes — beides aus dem
 * Monitor-Snapshot, den auch /briefing zeigt.
 */
export function TrendsCard({ locale, to }: { locale: MonitorLocale; to: string }) {
  const { data, isPending } = useMonitorSnapshot(locale);
  const top = (data?.keywords ?? []).slice(0, TREND_COUNT);
  const max = top[0]?.count || 1;
  const xTrends = [...(data?.socialTrends ?? [])]
    .sort((a, b) => a.rank - b.rank)
    .slice(0, X_TREND_COUNT);

  const slides: Slide[] = [];
  if (top.length > 0) {
    slides.push({
      key: 'keywords',
      label: 'Schlagwörter in den Nachrichten',
      content: (
        <ul className="m-0 flex list-none flex-col gap-[9px] p-0 md:gap-3 xl:flex-1 xl:justify-between">
          {top.map((k, i) => (
            <li
              key={k.keyword}
              className={cn(
                'flex flex-col gap-1 md:gap-[5px] xl:gap-1.5',
                i === 3 && 'max-md:hidden'
              )}
            >
              <span className="flex justify-between gap-1.5 text-sm md:text-[15px] xl:text-base">
                <span className="min-w-0 truncate font-bold text-foreground">{k.keyword}</span>
                <span className={DASH_MUTED}>{k.count}</span>
              </span>
              <span className="h-1 rounded-full bg-(--dash-mg-tint) md:h-[5px] xl:h-1.5">
                <span
                  className="block h-full rounded-full bg-(image:--dash-bar)"
                  style={{ width: `${Math.max(MIN_BAR_PCT, Math.round((k.count / max) * 100))}%` }}
                />
              </span>
            </li>
          ))}
        </ul>
      ),
    });
  }
  if (xTrends.length > 0) {
    slides.push({
      key: 'x',
      label: `X-Trends in ${locale === 'at' ? 'Österreich' : 'Deutschland'}`,
      content: (
        <>
          <span className={cn('text-[13px] xl:text-sm', DASH_MUTED)}>Auf X</span>
          <ol className="m-0 flex list-none flex-col gap-1 p-0 xl:gap-1.5">
            {xTrends.map((t, i) => (
              <li
                key={`${t.rank}-${t.name}`}
                className={cn(
                  'min-w-0 truncate text-sm font-bold text-foreground md:text-[15px] xl:text-base',
                  i >= 4 && 'max-md:hidden'
                )}
              >
                {t.name}
              </li>
            ))}
          </ol>
        </>
      ),
    });
  }

  return (
    <AsideCard aria-label="Trends" aria-busy={isPending} className="md:gap-3">
      <h2 className={ASIDE_TITLE}>
        <Link to={to} className={ASIDE_TITLE_LINK}>
          Trends
        </Link>
      </h2>
      {slides.length > 0 ? (
        <SlideStack
          slides={slides}
          slideClassName={(key) =>
            key === 'keywords' ? 'flex flex-col' : 'flex flex-col gap-2 xl:gap-2.5'
          }
        />
      ) : isPending ? (
        <TrendsSkeleton />
      ) : (
        <p className={cn('m-0 text-sm', DASH_MUTED)}>Gerade keine Themen.</p>
      )}
    </AsideCard>
  );
}
