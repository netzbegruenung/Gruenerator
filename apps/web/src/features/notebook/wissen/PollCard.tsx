import { deltaText, grueneSnapshot, isGruene, pct } from '@gruenerator/shared/monitor';
import { cn } from '@gruenerator/ui';
import { Link } from 'react-router-dom';

import { useEuGreens, usePolls } from '../../monitor/hooks/useMonitor';

import { ASIDE_TITLE, ASIDE_TITLE_LINK, AsideCard } from './WissenLayout';
import { PollSkeleton } from './WissenSkeletons';

import type { EuGreensData, MonitorLocale } from '@gruenerator/contracts';

import {
  DASH_ACCENT_TEXT,
  DASH_DISPLAY,
  DASH_HEADING,
  DASH_MUTED,
} from '@/components/dashboard/dashboardStyles';
import { SlideStack, type Slide } from '@/components/dashboard/slides';

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
        stroke="var(--dash-mg)"
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

const EUROPE_COUNT = 4;

type EuGreen = EuGreensData['results'][number];

/**
 * Die stärksten Grünen in Europa — ohne das eigene Land (das zeigt die erste
 * Folie), ohne das EU-Parlament und ohne breite Bündnisse, in denen die Grünen
 * nur ein kleiner Partner sind (FR NFP, ES Sumar): deren Wert wäre keine grüne Stärke.
 */
function strongestInEurope(results: EuGreen[], ownCountry: string): EuGreen[] {
  return results
    .filter((r) => !r.broadAlliance && r.countryCode !== 'eu' && r.countryCode !== ownCountry)
    .sort((a, b) => b.percent - a.percent)
    .slice(0, EUROPE_COUNT);
}

/**
 * „Umfragen" in zwei Folien zum Wischen (oder über die Punkte), ohne Durchwechseln:
 *
 * 1. Das eigene Land — Mittel der Sonntagsfrage, Abstand zur Vorwoche, Verlauf
 *    und die drei stärksten anderen Parteien. Auf dem Tablet stehen Zahl und
 *    Parteien nebeneinander, auf dem Desktop untereinander (`xl:order-*`), auf
 *    dem Smartphone entfallen die Parteien.
 * 2. „Grüne in Europa" — die stärksten grünen Parteien der anderen Länder.
 *
 * Fehlt eine der beiden Quellen, bleibt die andere als einzige Folie stehen.
 */
export function PollCard({ locale, to }: { locale: MonitorLocale; to: string }) {
  const { data, isPending } = usePolls(locale === 'at' ? 'oesterreich' : 'deutschland');
  const eu = useEuGreens();
  // In einer leeren 200-Antwort fehlen `average`/`polls` (Teilausfall).
  const g = data?.average && data.polls ? grueneSnapshot(data) : null;
  const others = Object.entries(data?.average ?? {})
    .filter(([party]) => !isGruene(party))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  const delta = g?.delta ? deltaText(g.delta) : '';
  const europe = strongestInEurope(eu.data?.results ?? [], locale);

  const nationalLabel = `Umfragen in ${locale === 'at' ? 'Österreich' : 'Deutschland'}`;
  const slides: Slide[] = [];
  if (g?.value != null) {
    slides.push({
      key: 'national',
      label: nationalLabel,
      content: (
        <>
          <div className="flex flex-col gap-0.5 xl:flex-row xl:items-baseline xl:gap-2.5">
            <span
              className={cn(
                'text-[32px] font-bold leading-[1.05] md:text-[40px] xl:text-5xl',
                DASH_DISPLAY,
                DASH_HEADING
              )}
            >
              {pct(g.value)}
            </span>
            {delta && (
              <span
                className={cn('text-[13px] font-bold md:text-sm xl:text-base', DASH_ACCENT_TEXT)}
              >
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
      ),
    });
  }
  if (europe.length > 0) {
    slides.push({
      key: 'europe',
      label: 'Grüne in Europa',
      content: (
        <>
          <span className={cn('text-[13px] xl:text-sm', DASH_MUTED)}>Grüne in Europa</span>
          <ul className="m-0 flex list-none flex-col gap-1 p-0 xl:gap-1.5">
            {europe.map((r) => (
              <li
                key={r.countryCode}
                className="flex justify-between gap-2 text-sm text-foreground xl:text-base"
              >
                <span className="min-w-0 truncate" title={r.party}>
                  {r.countryName}
                </span>
                <span className="font-bold">{pct(r.percent)}</span>
              </li>
            ))}
          </ul>
        </>
      ),
    });
  }

  return (
    <AsideCard aria-label="Umfragen" aria-busy={isPending}>
      <h2 className={ASIDE_TITLE}>
        <Link to={to} className={ASIDE_TITLE_LINK}>
          Umfragen
        </Link>
      </h2>
      {slides.length > 0 ? (
        <SlideStack
          slides={slides}
          slideClassName={(key) =>
            key === 'national'
              ? 'flex flex-col gap-2.5 md:grid md:grid-cols-[auto_minmax(0,1fr)] md:items-end md:gap-x-5 md:gap-y-2 xl:flex xl:items-stretch xl:justify-between'
              : 'flex flex-col gap-2 xl:gap-2.5'
          }
        />
      ) : isPending ? (
        <PollSkeleton />
      ) : (
        <p className={cn('m-0 text-sm', DASH_MUTED)}>Gerade keine Umfragewerte.</p>
      )}
    </AsideCard>
  );
}
