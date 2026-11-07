import {
  deltaText,
  europaGrueneValues,
  formatPollDate,
  grueneSnapshot,
  isGruene,
  laenderGrueneValues,
  partyOrder,
  pct,
  type UmfragenRegion,
} from '@gruenerator/shared/monitor';
import { cn } from '@gruenerator/ui';
import { useState } from 'react';

import { usePolls, usePollsOverview, useEuGreens } from '../hooks/useMonitor';
import { PARTY_COLORS } from '../partyColors';

import { DeutschlandMap, EuropaMap } from './GreensChoropleth';
import { PillButton } from './PillButton';
import { TrendSparkline } from './TrendSparkline';

import type { MonitorLocale } from '../hooks/useMonitor';

import { Bone } from '@/components/dashboard/Bone';
import {
  DASH_ACCENT_TEXT,
  DASH_CARD,
  DASH_DISPLAY,
  DASH_HEADING,
  DASH_MUTED,
} from '@/components/dashboard/dashboardStyles';

// Farben und Karten wie /briefing (Dashboard-Tokens, `.dashboard-surface` setzt
// die Seite); Parteifarben bleiben die der Parteien.

/** Weiße Karte mit dem Innenmaß der Briefing-Karten. */
const CARD = cn('rounded-[20px] px-[clamp(20px,3vw,32px)] py-[clamp(22px,3vw,30px)]', DASH_CARD);
/** Kartenüberschrift wie auf /briefing. */
const CARD_TITLE = cn('m-0 text-[clamp(19px,2.2vw,22px)] font-bold', DASH_DISPLAY, DASH_HEADING);

function GlanceHero({ parliament, regionLabel }: { parliament: string; regionLabel: string }) {
  const { data, isPending } = usePolls(parliament);
  const g = grueneSnapshot(data);
  if (!g) {
    return isPending ? (
      <div aria-hidden className={cn(CARD, 'flex flex-col gap-3')}>
        <Bone className="h-3.5 w-32" />
        <Bone className="h-16 w-48" />
        <Bone className="h-4 w-72 max-w-full" />
      </div>
    ) : null;
  }

  return (
    <div className={cn(CARD, 'flex flex-wrap items-center justify-between gap-8')}>
      <div>
        <p className="m-0 mb-1 text-[13px] font-bold uppercase tracking-[0.04em] text-(--dash-mg-ink)">
          Grüne · {regionLabel}
        </p>
        <div className="flex items-baseline gap-3.5">
          <span
            className={cn(
              'text-[clamp(52px,8vw,70px)] font-bold leading-none tracking-[-0.03em]',
              DASH_DISPLAY,
              DASH_HEADING
            )}
          >
            {pct(g.value)}
          </span>
          {deltaText(g.delta) && (
            <span className={cn('text-[1.1rem] font-bold', DASH_ACCENT_TEXT)}>
              {deltaText(g.delta)}
            </span>
          )}
        </div>
        <p className={cn('m-0 mt-2.5 text-[0.9rem]', DASH_MUTED)}>
          {g.lastPoll ? `Letzte Umfrage: ${formatPollDate(g.lastPoll)} · ` : ''}
          Wöchentlich aggregierter Durchschnitt
        </p>
      </div>
      {g.trend.length >= 2 && (
        <div className="flex flex-col items-end gap-1.5">
          <TrendSparkline points={g.trend} />
          <span className={cn('text-[12px]', DASH_MUTED)}>Trend · letzte 12 Wochen</span>
        </div>
      )}
    </div>
  );
}

function SonntagsfrageBars({ parliament, subtitle }: { parliament: string; subtitle: string }) {
  const { data, isLoading } = usePolls(parliament);
  if (isLoading) {
    return (
      <div aria-hidden className="flex flex-col gap-3.5">
        <Bone className="h-6 w-40" />
        {['w-full', 'w-4/5', 'w-3/5', 'w-1/2', 'w-2/5', 'w-1/4'].map((w) => (
          <Bone key={w} className={cn('h-[22px]', w)} />
        ))}
      </div>
    );
  }
  if (!data || Object.keys(data.average).length === 0) {
    return <p className={cn('text-sm', DASH_MUTED)}>Keine Umfragedaten verfügbar.</p>;
  }

  const order = partyOrder(data.average);
  const max = Math.max(...order.map((p) => data.average[p]), 1);

  return (
    <div>
      <h2 className={cn(CARD_TITLE, 'mb-1')}>Sonntagsfrage</h2>
      <p className={cn('m-0 mb-6 text-[0.9rem]', DASH_MUTED)}>{subtitle}</p>

      <div className="flex flex-col gap-3.5">
        {order.map((party) => {
          const value = data.average[party];
          const delta = data.diffs?.[party];
          const hi = isGruene(party);
          return (
            <div
              key={party}
              className={cn(
                'flex items-center gap-3.5 rounded-[10px]',
                hi ? '-mx-3.5 bg-(--dash-mg-tint) px-3.5 py-2.5' : ''
              )}
            >
              <span className={cn('w-[86px] flex-none text-[0.95rem] font-bold', DASH_HEADING)}>
                {party}
              </span>
              <div className="h-[22px] flex-1 overflow-hidden rounded-md bg-(--dash-skeleton)">
                <div
                  className="h-full rounded-md transition-[width] duration-500"
                  style={{
                    width: `${(value / max) * 100}%`,
                    backgroundColor: PARTY_COLORS[party] || '#888',
                  }}
                />
              </div>
              <span
                className={cn(
                  'w-14 flex-none text-right text-[1rem] font-bold tabular-nums',
                  DASH_HEADING
                )}
              >
                {pct(value)}
              </span>
              <span
                className={cn(
                  'w-11 flex-none text-[0.85rem] font-bold',
                  // Gewinne im Akzent, Verluste grau — Rot läge zu nah am Magenta.
                  delta != null && delta > 0 ? 'text-(--dash-mg-ink)' : DASH_MUTED
                )}
              >
                {deltaText(delta)}
              </span>
            </div>
          );
        })}
      </div>

      <p className={cn('m-0 mt-[22px] text-[0.8rem]', DASH_MUTED)}>
        Daten:{' '}
        <a
          href="https://politpro.eu"
          target="_blank"
          rel="noopener noreferrer"
          className={cn('font-bold no-underline hover:underline', DASH_ACCENT_TEXT)}
        >
          PolitPro
        </a>{' '}
        · Durchschnitt aller Institute
      </p>
    </div>
  );
}

/** Platzhalter in der Größe der Karte (380 × 470). */
function MapBone() {
  return <Bone className="aspect-[380/470] w-full max-w-[380px] rounded-2xl" />;
}

// Split into per-view components so the Bundesland overview is only fetched
// while the German map is actually mounted (AT shows Europe only).
// A cold overview is paced upstream and takes seconds; drawing the map before
// it lands painted every Land as "keine Daten".
function DeutschlandMapPanel() {
  const { data, isLoading } = usePollsOverview('DE');
  if (isLoading) return <MapBone />;
  if (!data) {
    return <p className={cn('text-sm', DASH_MUTED)}>Länderdaten konnten nicht geladen werden.</p>;
  }
  return <DeutschlandMap values={laenderGrueneValues(data)} />;
}

function EuropaMapPanel() {
  const { data, isLoading } = useEuGreens();
  if (isLoading) return <MapBone />;
  if (!data) {
    return <p className={cn('text-sm', DASH_MUTED)}>Europadaten konnten nicht geladen werden.</p>;
  }
  return <EuropaMap values={europaGrueneValues(data)} />;
}

function LaenderMapPanel({ locale }: { locale: MonitorLocale }) {
  const isAT = locale === 'at';
  const [view, setView] = useState<'de' | 'eu'>(isAT ? 'eu' : 'de');
  const showDE = !isAT && view === 'de';

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className={CARD_TITLE}>{showDE ? 'Grüne in den Ländern' : 'Grüne in Europa'}</h2>
        {!isAT && (
          <div className="flex items-center gap-1 rounded-full bg-(--dash-mg-tint) p-1">
            <PillButton size="sm" active={view === 'de'} onClick={() => setView('de')}>
              Bundesländer
            </PillButton>
            <PillButton size="sm" active={view === 'eu'} onClick={() => setView('eu')}>
              Europa
            </PillButton>
          </div>
        )}
      </div>
      <p className={cn('m-0 mb-6 text-[0.9rem]', DASH_MUTED)}>
        {showDE
          ? 'Aktuelle Umfragewerte je Bundesland'
          : 'Wahltrends grüner Parteien in nationalen Parlamenten'}
      </p>
      {showDE ? <DeutschlandMapPanel /> : <EuropaMapPanel />}
      {!showDE && (
        <p className={cn('m-0 mt-4 text-[0.78rem] leading-[1.5]', DASH_MUTED)}>
          Schraffierte Länder zeigen einen Bündniswert, in dem Grüne nur Teil einer breiteren Liste
          sind (z.&nbsp;B. Frankreich NFP, Spanien Sumar). Graue Länder haben kein separat
          ausgewiesenes grünes Ergebnis.
        </p>
      )}
    </div>
  );
}

interface UmfragenViewProps {
  locale: MonitorLocale;
  /** A single Land (`/umfragen/:land`) instead of the national view. */
  region?: UmfragenRegion | null;
}

export function UmfragenView({ locale, region }: UmfragenViewProps) {
  const isAT = (region?.locale ?? locale) === 'at';
  const parliament = region?.parliament ?? (isAT ? 'oesterreich' : 'deutschland');
  const regionLabel = region?.label ?? (isAT ? 'Österreich' : 'Bund');
  const subtitle =
    region?.subtitle ??
    (isAT
      ? 'Wenn am nächsten Sonntag Nationalratswahl wäre …'
      : 'Wenn am nächsten Sonntag Wahl wäre …');

  return (
    <>
      <GlanceHero parliament={parliament} regionLabel={regionLabel} />
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.45fr_1fr]">
        <section className={CARD}>
          <SonntagsfrageBars parliament={parliament} subtitle={subtitle} />
        </section>
        <section className={CARD}>
          <LaenderMapPanel locale={isAT ? 'at' : 'de'} />
        </section>
      </div>
    </>
  );
}
