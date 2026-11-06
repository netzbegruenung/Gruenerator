import { cn } from '@gruenerator/ui';
import { Link } from 'react-router-dom';

import { useMonitorSnapshot } from '../../monitor/hooks/useMonitor';

import { ASIDE_TITLE, AsideCard } from './WissenLayout';
import { TrendsSkeleton } from './WissenSkeletons';
import { WD_MUTED } from './wissenStyles';

import type { MonitorLocale } from '@gruenerator/contracts';

const TREND_COUNT = 4;
/** Ein Balken bleibt sichtbar, auch wenn das Thema weit hinter dem ersten liegt. */
const MIN_BAR_PCT = 8;

/** „Im Gespräch": die meistgenannten Schlagwörter der letzten 24 Stunden mit Balken (Smartphone: drei). */
export function TrendsCard({ locale, to }: { locale: MonitorLocale; to: string }) {
  const { data, isPending } = useMonitorSnapshot(locale);
  const top = (data?.keywords ?? []).slice(0, TREND_COUNT);
  const max = top[0]?.count || 1;

  return (
    <AsideCard aria-label="Im Gespräch" aria-busy={isPending} className="md:gap-3">
      <h2 className={ASIDE_TITLE}>
        <Link to={to} className="text-inherit no-underline hover:underline">
          Im Gespräch
        </Link>
      </h2>
      {top.length > 0 ? (
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
                <span className={WD_MUTED}>{k.count}</span>
              </span>
              <span className="h-1 rounded-full bg-(--wd-mg-tint) md:h-[5px] xl:h-1.5">
                <span
                  className="block h-full rounded-full bg-(--wd-mg)"
                  style={{ width: `${Math.max(MIN_BAR_PCT, Math.round((k.count / max) * 100))}%` }}
                />
              </span>
            </li>
          ))}
        </ul>
      ) : isPending ? (
        <TrendsSkeleton />
      ) : (
        <p className={cn('m-0 text-sm', WD_MUTED)}>Gerade keine Themen.</p>
      )}
    </AsideCard>
  );
}
