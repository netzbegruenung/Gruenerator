import { cn, LoadingSection } from '@gruenerator/ui';
import { useState } from 'react';

import { BUNDESLAENDER } from '../bundeslaender';
import { usePolls, useEuGreens } from '../hooks/useMonitor';
import { PARTY_COLORS } from '../partyColors';

import { DeutschlandMap, EuropaMap, type ChoroplethValues } from './GreensChoropleth';
import { PillButton } from './MonitorPageHeader';
import {
  MONITOR_ACCENT,
  MONITOR_CARD,
  MONITOR_FAINT,
  MONITOR_HEADING,
  MONITOR_MUTED,
  MONITOR_PILL_TRACK,
} from './theme';

import type { MonitorLocale } from '../hooks/useMonitor';

// PolitPro country code → world-atlas English geo name (Europe choropleth join).
const EU_CODE_GEO: Record<string, string> = {
  de: 'Germany',
  at: 'Austria',
  fi: 'Finland',
  se: 'Sweden',
  ie: 'Ireland',
  nl: 'Netherlands',
  lu: 'Luxembourg',
  it: 'Italy',
  hr: 'Croatia',
  pt: 'Portugal',
  lv: 'Latvia',
  ro: 'Romania',
  ee: 'Estonia',
  be: 'Belgium',
  dk: 'Denmark',
  no: 'Norway',
  ch: 'Switzerland',
  gb: 'United Kingdom',
  uk: 'United Kingdom',
  pl: 'Poland',
  cz: 'Czechia',
  sk: 'Slovakia',
  hu: 'Hungary',
  si: 'Slovenia',
  gr: 'Greece',
  bg: 'Bulgaria',
  lt: 'Lithuania',
  es: 'Spain',
  fr: 'France',
};

function isGruene(party: string): boolean {
  return party === 'GRÜNE' || party === 'Grüne' || party.toLowerCase().includes('grüne');
}

function grueneKey(average: Record<string, number>): string | null {
  for (const k of Object.keys(average)) if (isGruene(k)) return k;
  return null;
}

function partyOrder(average: Record<string, number>): string[] {
  return Object.entries(average)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([k]) => k);
}

const de1 = (v: number): string =>
  v.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const pct = (v: number | null | undefined): string => (v == null ? '–' : `${de1(v)}%`);

function deltaText(d: number | null | undefined): string {
  if (d == null || d === 0) return '';
  return `${d > 0 ? '+' : ''}${de1(d)}`;
}

function formatPollDate(dateStr?: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr.replace(/\s*\d{4}$/, '');
  return d.toLocaleDateString('de-DE', { day: 'numeric', month: 'long' });
}

/** 12-week trend sparkline (area + line + end dot) for the glance hero. */
function HeroSparkline({ points }: { points: { date: string; value: number }[] }) {
  const s = points.slice(-12).map((p) => p.value);
  if (s.length < 2) return null;
  const W = 260;
  const H = 72;
  const P = 6;
  const min = Math.min(...s);
  const max = Math.max(...s);
  const rng = max - min || 1;
  const pts = s.map(
    (v, i) =>
      [P + (i * (W - 2 * P)) / (s.length - 1), H - P - ((v - min) / rng) * (H - 2 * P)] as const
  );
  const line = 'M' + pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L');
  const last = pts[pts.length - 1];
  const fill = `${line} L${last[0].toFixed(1)} ${H - P} L${pts[0][0].toFixed(1)} ${H - P} Z`;

  return (
    <div className="flex flex-col items-end gap-1.5">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="max-w-full overflow-visible">
        <path d={fill} fill="rgba(82,144,122,0.12)" />
        <path
          d={line}
          fill="none"
          stroke="#52907a"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx={last[0]} cy={last[1]} r={4} fill="#316049" />
      </svg>
      <span className={cn('text-[12px]', MONITOR_FAINT)}>Trend · letzte 12 Wochen</span>
    </div>
  );
}

function GlanceHero({ parliament, regionLabel }: { parliament: string; regionLabel: string }) {
  const { data } = usePolls(parliament);
  if (!data || Object.keys(data.average).length === 0) return null;

  const gk = grueneKey(data.average);
  const value = gk ? data.average[gk] : null;
  const delta = gk ? data.diffs?.[gk] : undefined;
  const trend = gk ? data.trend?.[gk] : undefined;
  const lastPoll = data.polls.length > 1 ? data.polls[0]?.date : undefined;

  return (
    <div
      className={cn('mb-10 flex flex-wrap items-center justify-between gap-8 p-8', MONITOR_CARD)}
    >
      <div>
        <p className="m-0 mb-1 text-[13px] font-bold uppercase tracking-[0.12em] text-[#52907a] dark:text-[#7fae9c]">
          Grüne · {regionLabel}
        </p>
        <div className="flex items-baseline gap-3.5">
          <span
            className={cn(
              'text-[4.4rem] font-semibold leading-none tracking-[-0.03em]',
              MONITOR_HEADING
            )}
          >
            {pct(value)}
          </span>
          {deltaText(delta) && (
            <span className={cn('text-[1.1rem] font-bold', MONITOR_ACCENT)}>
              {deltaText(delta)}
            </span>
          )}
        </div>
        <p className={cn('m-0 mt-2.5 text-[0.9rem]', MONITOR_MUTED)}>
          {lastPoll ? `Letzte Umfrage: ${formatPollDate(lastPoll)} · ` : ''}
          Wöchentlich aggregierter Durchschnitt
        </p>
      </div>
      {trend && trend.length >= 2 && <HeroSparkline points={trend} />}
    </div>
  );
}

function SonntagsfrageBars({ parliament, subtitle }: { parliament: string; subtitle: string }) {
  const { data, isLoading } = usePolls(parliament);
  if (isLoading) return <LoadingSection />;
  if (!data || Object.keys(data.average).length === 0) {
    return <p className={cn('text-sm', MONITOR_MUTED)}>Keine Umfragedaten verfügbar.</p>;
  }

  const order = partyOrder(data.average);
  const max = Math.max(...order.map((p) => data.average[p]), 1);

  return (
    <div>
      <h2
        className={cn('m-0 mb-1 text-[1.35rem] font-semibold tracking-[-0.01em]', MONITOR_HEADING)}
      >
        Sonntagsfrage
      </h2>
      <p className={cn('m-0 mb-6 text-[0.9rem]', MONITOR_MUTED)}>{subtitle}</p>

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
                hi ? '-mx-3.5 bg-[#eaf3ee] px-3.5 py-2.5 dark:bg-[#1e2f27]' : ''
              )}
            >
              <span className={cn('w-[86px] flex-none text-[0.95rem] font-bold', MONITOR_HEADING)}>
                {party}
              </span>
              <div className="h-[22px] flex-1 overflow-hidden rounded-md bg-[#eef2ef] dark:bg-grey-800">
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
                  MONITOR_HEADING
                )}
              >
                {pct(value)}
              </span>
              <span
                className="w-11 flex-none text-[0.85rem] font-bold"
                style={{
                  color: delta == null ? '#a3ada7' : delta >= 0 ? '#316049' : '#b4442f',
                }}
              >
                {deltaText(delta)}
              </span>
            </div>
          );
        })}
      </div>

      <p className={cn('m-0 mt-[22px] text-[0.8rem]', MONITOR_FAINT)}>
        Daten:{' '}
        <a
          href="https://politpro.eu"
          target="_blank"
          rel="noopener noreferrer"
          className={cn('no-underline hover:underline', MONITOR_ACCENT)}
        >
          PolitPro
        </a>{' '}
        · Durchschnitt aller Institute
      </p>
    </div>
  );
}

/** Per-Bundesland Grüne value keyed by geo name — one usePolls per state (constant list). */
function useLaenderGrueneValues(): ChoroplethValues {
  const values: ChoroplethValues = {};
  for (const b of BUNDESLAENDER) {
    // BUNDESLAENDER is a static module constant → hook count is stable.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { data } = usePolls(b.id);
    const gk = data ? grueneKey(data.average) : null;
    const lastDate = data && data.polls.length > 1 ? data.polls[0]?.date : undefined;
    values[b.name] = {
      v: gk && data ? data.average[gk] : null,
      date: lastDate ? formatPollDate(lastDate) : undefined,
    };
  }
  return values;
}

// Split into per-view components so the 16 Bundesland poll hooks only run while
// the German map is actually mounted (AT shows Europe only → no wasted fetches).
function DeutschlandMapPanel() {
  return <DeutschlandMap values={useLaenderGrueneValues()} />;
}

function EuropaMapPanel() {
  const { data } = useEuGreens();
  const values: ChoroplethValues = {};
  for (const r of data?.results ?? []) {
    const geo = EU_CODE_GEO[r.countryCode];
    if (!geo) continue;
    values[geo] = { v: r.percent, label: r.countryName, sub: r.party, marked: r.broadAlliance };
  }
  return <EuropaMap values={values} />;
}

function LaenderMapPanel({ locale }: { locale: MonitorLocale }) {
  const isAT = locale === 'at';
  const [view, setView] = useState<'de' | 'eu'>(isAT ? 'eu' : 'de');
  const showDE = !isAT && view === 'de';

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className={cn('m-0 text-[1.35rem] font-semibold tracking-[-0.01em]', MONITOR_HEADING)}>
          {showDE ? 'Grüne in den Ländern' : 'Grüne in Europa'}
        </h2>
        {!isAT && (
          <div className={MONITOR_PILL_TRACK}>
            <PillButton size="sm" active={view === 'de'} onClick={() => setView('de')}>
              Bundesländer
            </PillButton>
            <PillButton size="sm" active={view === 'eu'} onClick={() => setView('eu')}>
              Europa
            </PillButton>
          </div>
        )}
      </div>
      <p className={cn('m-0 mb-6 text-[0.9rem]', MONITOR_MUTED)}>
        {showDE
          ? 'Aktuelle Umfragewerte je Bundesland'
          : 'Wahltrends grüner Parteien in nationalen Parlamenten'}
      </p>
      {showDE ? <DeutschlandMapPanel /> : <EuropaMapPanel />}
      {!showDE && (
        <p className={cn('m-0 mt-4 text-[0.78rem] leading-[1.5]', MONITOR_FAINT)}>
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
}

export function UmfragenView({ locale }: UmfragenViewProps) {
  const isAT = locale === 'at';
  const parliament = isAT ? 'oesterreich' : 'deutschland';
  const subtitle = isAT
    ? 'Wenn am nächsten Sonntag Nationalratswahl wäre …'
    : 'Wenn am nächsten Sonntag Wahl wäre …';

  return (
    <div>
      <GlanceHero parliament={parliament} regionLabel={isAT ? 'Österreich' : 'Bund'} />
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1.45fr_1fr]">
        <SonntagsfrageBars parliament={parliament} subtitle={subtitle} />
        <LaenderMapPanel locale={locale} />
      </div>
    </div>
  );
}
