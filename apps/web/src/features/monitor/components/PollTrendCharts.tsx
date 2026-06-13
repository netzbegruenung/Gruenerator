/**
 * Recharts-based trend views for the Umfragen tab:
 * - EuGreensTrendSection: multi-country line chart of green parties over time
 * - EuGreensElectionDiffChart: diverging bars vs the last election
 * - Sparkline: tiny inline trend for the EU deck cards
 * - SonntagsfrageTrendSection: full party trend since 2019 + poll scatter
 * - EuGreenPartyPanel: per-party detail with AI Wikipedia profile
 *
 * All time axes are numeric epoch-ms scales so lines and scatters with
 * different date grids can share one chart.
 */
import { ExternalLink, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { useEuGreenProfile, usePollsHistory } from '../hooks/useMonitor';
import { PARTY_COLORS } from '../partyColors';

import type { EuGreenResult, EuGreensHistoryData, PollTrendPoint } from '@gruenerator/contracts';

// Distinct colors per country for the EU comparison chart.
const COUNTRY_COLORS: Record<string, string> = {
  de: '#46962b',
  at: '#88B626',
  eu: '#7bdcb5',
  fi: '#61BF1A',
  se: '#80AA4E',
  dk: '#0891b2',
  ie: '#f59e0b',
  lu: '#8b5cf6',
  nl: '#e3000f',
  it: '#be3075',
  hr: '#2563eb',
  pt: '#d97706',
  lv: '#db2777',
  ro: '#4b5563',
  ee: '#059669',
};

type TimeRange = '1y' | '2y' | 'max';

const RANGE_LABELS: Record<TimeRange, string> = { '1y': '1 Jahr', '2y': '2 Jahre', max: 'Max' };

function rangeStart(range: TimeRange): number {
  if (range === 'max') return 0;
  const d = new Date();
  d.setFullYear(d.getFullYear() - (range === '1y' ? 1 : 2));
  return d.getTime();
}

function toTimePoints(points: PollTrendPoint[], from: number) {
  return points
    .map((p) => ({ ts: new Date(p.date).getTime(), value: p.value }))
    .filter((p) => !Number.isNaN(p.ts) && p.ts >= from);
}

function formatTick(ts: number): string {
  return new Date(ts).toLocaleDateString('de-DE', { month: 'short', year: '2-digit' });
}

function formatTooltipDate(ts: number): string {
  return new Date(ts).toLocaleDateString('de-DE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function RangeSelector({
  value,
  onChange,
}: {
  value: TimeRange;
  onChange: (r: TimeRange) => void;
}) {
  return (
    <div className="flex gap-0.5 rounded-md border border-grey-200 dark:border-grey-700 p-0.5">
      {(Object.keys(RANGE_LABELS) as TimeRange[]).map((r) => (
        <button
          key={r}
          onClick={() => onChange(r)}
          className={`px-xs py-0.5 text-[10px] rounded ${
            value === r
              ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 font-medium'
              : 'text-grey-500 hover:text-foreground'
          }`}
        >
          {RANGE_LABELS[r]}
        </button>
      ))}
    </div>
  );
}

export function Sparkline({
  points,
  color = '#46962b',
}: {
  points: PollTrendPoint[];
  color?: string;
}) {
  const data = useMemo(() => toTimePoints(points.slice(-52), 0), [points]);
  if (data.length < 2) return null;
  return (
    <div className="h-6 w-16 shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.2}
            fill={color}
            fillOpacity={0.15}
            isAnimationActive={false}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── EU greens: multi-country comparison ──────────────────────────────────────

export function EuGreensTrendSection({ history }: { history: EuGreensHistoryData }) {
  const [range, setRange] = useState<TimeRange>('2y');
  const sorted = useMemo(
    () =>
      [...history.series].sort(
        (a, b) => (b.points.at(-1)?.value ?? 0) - (a.points.at(-1)?.value ?? 0)
      ),
    [history.series]
  );
  const [visible, setVisible] = useState<Set<string>>(
    () => new Set(sorted.slice(0, 6).map((s) => s.countryCode))
  );

  const from = rangeStart(range);
  const shown = sorted.filter((s) => visible.has(s.countryCode));

  const toggle = (code: string) => {
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-sm mb-sm">
        <p className="text-xs font-medium text-foreground">Trend-Vergleich</p>
        <RangeSelector value={range} onChange={setRange} />
      </div>

      <div className="flex flex-wrap gap-1 mb-sm">
        {sorted.map((s) => {
          const active = visible.has(s.countryCode);
          const color = COUNTRY_COLORS[s.countryCode] || '#888';
          return (
            <button
              key={s.countryCode}
              onClick={() => toggle(s.countryCode)}
              className={`flex items-center gap-1 px-xs py-0.5 rounded-full border text-[10px] transition-colors ${
                active
                  ? 'border-transparent text-white'
                  : 'border-grey-200 dark:border-grey-700 text-grey-500'
              }`}
              style={active ? { backgroundColor: color } : undefined}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: active ? '#fff' : color }}
              />
              {s.countryName}
            </button>
          );
        })}
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-grey-200, #e5e7eb)" />
            <XAxis
              dataKey="ts"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              tickFormatter={formatTick}
              tick={{ fontSize: 10 }}
              minTickGap={40}
            />
            <YAxis tick={{ fontSize: 10 }} unit="%" domain={[0, 'auto']} />
            <Tooltip
              labelFormatter={(ts) => formatTooltipDate(Number(ts))}
              formatter={(value, name) => [`${String(value)}%`, String(name)]}
              contentStyle={{ fontSize: 11 }}
            />
            {shown.map((s) => (
              <Line
                key={s.countryCode}
                data={toTimePoints(s.points, from)}
                dataKey="value"
                name={s.countryName}
                type="monotone"
                stroke={COUNTRY_COLORS[s.countryCode] || '#888'}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── EU greens: change vs last election ───────────────────────────────────────

export function EuGreensElectionDiffChart({ results }: { results: EuGreenResult[] }) {
  const data = useMemo(
    () =>
      results
        .filter((r) => r.electionDiff != null && r.countryCode !== 'eu')
        .map((r) => ({ country: r.countryName, diff: r.electionDiff as number }))
        .sort((a, b) => b.diff - a.diff),
    [results]
  );
  if (data.length === 0) return null;

  const maxAbs = Math.max(...data.map((d) => Math.abs(d.diff)), 1);

  return (
    <div>
      <p className="text-xs font-medium text-foreground mb-sm">Seit der letzten Wahl</p>
      <div style={{ height: data.length * 26 + 24 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 0, right: 24, bottom: 0, left: 8 }}
          >
            <XAxis
              type="number"
              domain={[-maxAbs, maxAbs]}
              tick={{ fontSize: 10 }}
              tickFormatter={(v: number) => `${v > 0 ? '+' : ''}${v}`}
            />
            <YAxis dataKey="country" type="category" width={110} tick={{ fontSize: 10 }} />
            <ReferenceLine x={0} stroke="var(--color-grey-400, #9ca3af)" />
            <Tooltip
              formatter={(value) => [
                `${Number(value) > 0 ? '+' : ''}${String(value)} Prozentpunkte`,
                'seit der Wahl',
              ]}
              contentStyle={{ fontSize: 11 }}
            />
            <Bar dataKey="diff" radius={3} isAnimationActive={false}>
              {data.map((d) => (
                <Cell key={d.country} fill={d.diff >= 0 ? '#46962b' : '#dc2626'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Sonntagsfrage: full trend + poll scatter ─────────────────────────────────

export function SonntagsfrageTrendSection({ parliament }: { parliament: string }) {
  const { data, isLoading } = usePollsHistory(parliament, true);
  const [range, setRange] = useState<TimeRange>('2y');
  const [showPolls, setShowPolls] = useState(true);

  const from = rangeStart(range);

  const parties = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.trend)
      .map(([party, points]) => ({ party, points, latest: points.at(-1)?.value ?? 0 }))
      .filter((p) => p.latest > 0 && p.party !== 'Sonstige')
      .sort((a, b) => b.latest - a.latest)
      .slice(0, 7);
  }, [data]);

  const scatterByParty = useMemo(() => {
    if (!data || !showPolls) return {};
    const byParty: Record<string, Array<{ ts: number; value: number }>> = {};
    for (const poll of data.polls) {
      const ts = new Date(poll.date).getTime();
      if (Number.isNaN(ts) || ts < from) continue;
      for (const { party } of parties) {
        const value = poll.parties[party];
        if (value != null) (byParty[party] ??= []).push({ ts, value });
      }
    }
    return byParty;
  }, [data, parties, showPolls, from]);

  if (isLoading) {
    return <p className="py-md text-center text-xs text-grey-400">Trendverlauf wird geladen…</p>;
  }
  if (!data || parties.length === 0) {
    return (
      <p className="py-md text-center text-xs text-grey-400">
        Für dieses Parlament ist kein Trendverlauf verfügbar.
      </p>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-sm mb-sm flex-wrap">
        <label className="flex items-center gap-1 text-[10px] text-grey-500 cursor-pointer">
          <input
            type="checkbox"
            checked={showPolls}
            onChange={(e) => setShowPolls(e.target.checked)}
            className="h-3 w-3 accent-primary-600"
          />
          Einzelumfragen anzeigen
        </label>
        <RangeSelector value={range} onChange={setRange} />
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-grey-200, #e5e7eb)" />
            <XAxis
              dataKey="ts"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              tickFormatter={formatTick}
              tick={{ fontSize: 10 }}
              minTickGap={40}
            />
            <YAxis tick={{ fontSize: 10 }} unit="%" domain={[0, 'auto']} />
            <Tooltip
              labelFormatter={(ts) => formatTooltipDate(Number(ts))}
              formatter={(value, name) => [`${String(value)}%`, String(name)]}
              contentStyle={{ fontSize: 11 }}
            />
            {showPolls &&
              parties.map(({ party }) =>
                scatterByParty[party]?.length ? (
                  <Scatter
                    key={`scatter-${party}`}
                    data={scatterByParty[party]}
                    dataKey="value"
                    name={party}
                    fill={PARTY_COLORS[party] || '#888'}
                    fillOpacity={0.3}
                    shape={(props: { cx?: number; cy?: number }) => (
                      <circle
                        cx={props.cx}
                        cy={props.cy}
                        r={1.8}
                        fill={PARTY_COLORS[party] || '#888'}
                        fillOpacity={0.35}
                      />
                    )}
                    isAnimationActive={false}
                    legendType="none"
                  />
                ) : null
              )}
            {parties.map(({ party, points }) => (
              <Line
                key={party}
                data={toTimePoints(points, from)}
                dataKey="value"
                name={party}
                type="monotone"
                stroke={PARTY_COLORS[party] || '#888'}
                strokeWidth={1.8}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-xs flex flex-wrap gap-x-sm gap-y-0.5">
        {parties.map(({ party, latest }) => (
          <span key={party} className="flex items-center gap-1 text-[10px]">
            <span
              className="h-1.5 w-3 rounded-sm"
              style={{ backgroundColor: PARTY_COLORS[party] || '#888' }}
            />
            <span className="font-medium" style={{ color: PARTY_COLORS[party] || undefined }}>
              {party}
            </span>
            <span className="text-grey-400 tabular-nums">{latest}%</span>
          </span>
        ))}
      </div>
      <p className="mt-xs text-[10px] text-grey-400">
        Linien: gewichteter PolitPro-Wahltrend (wöchentlich, seit 2019 je nach Verfügbarkeit).
        Punkte: Einzelumfragen der letzten zwei Jahre.
      </p>
    </div>
  );
}

// ── EU greens: party detail panel with AI profile ────────────────────────────

function ProfileTrendBadge({ value, label }: { value: number | null; label: string }) {
  if (value == null) return null;
  const Icon = value > 0 ? TrendingUp : value < 0 ? TrendingDown : Minus;
  const color = value > 0 ? 'text-green-600' : value < 0 ? 'text-red-500' : 'text-grey-400';
  return (
    <div className="flex flex-col items-center px-md">
      <span className={`flex items-center gap-0.5 text-sm font-bold tabular-nums ${color}`}>
        <Icon className="h-3.5 w-3.5" />
        {value > 0 ? '+' : ''}
        {value}
      </span>
      <span className="text-[10px] text-grey-400">{label}</span>
    </div>
  );
}

export function EuGreenPartyPanel({
  result,
  points,
}: {
  result: EuGreenResult;
  points?: PollTrendPoint[];
}) {
  const { data: profile, isLoading } = useEuGreenProfile(result.countryCode);
  const color = COUNTRY_COLORS[result.countryCode] || '#46962b';

  return (
    <div className="mt-sm rounded-lg border border-grey-200 dark:border-grey-700 p-md">
      <div className="flex items-start justify-between gap-sm flex-wrap">
        <div>
          <h4 className="text-sm font-semibold text-foreground-heading">
            {result.party} — {result.countryName}
          </h4>
          {result.note && <p className="text-[10px] text-grey-400">{result.note}</p>}
        </div>
        <div className="flex items-center divide-x divide-grey-200 dark:divide-grey-700">
          <div className="flex flex-col items-center px-md">
            <span className="text-sm font-bold text-green-600 tabular-nums">{result.percent}%</span>
            <span className="text-[10px] text-grey-400">aktuell</span>
          </div>
          <ProfileTrendBadge value={result.diff} label="zur Vorwoche" />
          <ProfileTrendBadge value={result.electionDiff} label="seit der Wahl" />
        </div>
      </div>

      {points && points.length > 1 && (
        <div className="h-32 mt-sm">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={toTimePoints(points, 0)}
              margin={{ top: 4, right: 8, bottom: 0, left: -16 }}
            >
              <XAxis
                dataKey="ts"
                type="number"
                scale="time"
                domain={['dataMin', 'dataMax']}
                tickFormatter={formatTick}
                tick={{ fontSize: 10 }}
                minTickGap={50}
              />
              <YAxis tick={{ fontSize: 10 }} unit="%" domain={[0, 'auto']} />
              <Tooltip
                labelFormatter={(ts) => formatTooltipDate(Number(ts))}
                formatter={(value) => [`${String(value)}%`, result.party]}
                contentStyle={{ fontSize: 11 }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={color}
                strokeWidth={1.5}
                fill={color}
                fillOpacity={0.12}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="mt-sm">
        {isLoading ? (
          <p className="text-xs text-grey-400 animate-pulse">KI-Zusammenfassung wird erstellt…</p>
        ) : profile?.summary ? (
          <>
            <p className="text-xs text-foreground/80 leading-relaxed">{profile.summary}</p>
            <p className="mt-xs text-[10px] text-grey-400">
              KI-generierte Zusammenfassung auf Basis von Wikipedia.
            </p>
          </>
        ) : (
          <p className="text-xs text-grey-400">Keine Kurzbeschreibung verfügbar.</p>
        )}
      </div>

      <div className="mt-sm flex flex-wrap gap-md">
        {profile?.website && (
          <a
            href={profile.website}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:underline"
          >
            Website
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
        {profile?.wikipediaUrl && (
          <a
            href={profile.wikipediaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:underline"
          >
            Wikipedia
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </div>
  );
}
