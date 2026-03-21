import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Card,
  CardContent,
  LoadingSection,
} from '@gruenerator/ui';
import { ExternalLink, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';

import { usePolls } from '../hooks/useMonitor';

import type { MonitorLocale } from '../hooks/useMonitor';

interface UmfragenViewProps {
  locale: MonitorLocale;
}

const PARTY_COLORS: Record<string, string> = {
  'CDU/CSU': '#000000',
  AfD: '#009ee0',
  SPD: '#e3000f',
  GRÜNE: '#46962b',
  Grüne: '#46962b',
  'DIE LINKE': '#be3075',
  Linke: '#be3075',
  BSW: '#571D47',
  FDP: '#ffed00',
  Sonstige: '#aaaaaa',
  ÖVP: '#63C3D0',
  NEOS: '#E84188',
  SPÖ: '#e3000f',
  FPÖ: '#0E6EB8',
};

const LAENDER = [
  { id: 'baden-wuerttemberg', name: 'Baden-Württemberg', short: 'BW' },
  { id: 'bayern', name: 'Bayern', short: 'BY' },
  { id: 'berlin', name: 'Berlin', short: 'BE' },
  { id: 'brandenburg', name: 'Brandenburg', short: 'BB' },
  { id: 'bremen', name: 'Bremen', short: 'HB' },
  { id: 'hamburg', name: 'Hamburg', short: 'HH' },
  { id: 'hessen', name: 'Hessen', short: 'HE' },
  { id: 'mecklenburg-vorpommern', name: 'Meck.-Vorpommern', short: 'MV' },
  { id: 'niedersachsen', name: 'Niedersachsen', short: 'NI' },
  { id: 'nordrhein-westfalen', name: 'NRW', short: 'NW' },
  { id: 'rheinland-pfalz', name: 'Rheinland-Pfalz', short: 'RP' },
  { id: 'saarland', name: 'Saarland', short: 'SL' },
  { id: 'sachsen', name: 'Sachsen', short: 'SN' },
  { id: 'sachsen-anhalt', name: 'Sachsen-Anhalt', short: 'ST' },
  { id: 'schleswig-holstein', name: 'Schleswig-Holstein', short: 'SH' },
  { id: 'thueringen', name: 'Thüringen', short: 'TH' },
];

function isGruene(party: string): boolean {
  return party === 'GRÜNE' || party === 'Grüne' || party.toLowerCase().includes('grüne');
}

function getPartyOrder(average: Record<string, number>): string[] {
  return Object.entries(average)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([k]) => k);
}

function findGrueneValue(average: Record<string, number>): number | null {
  for (const [k, v] of Object.entries(average)) {
    if (isGruene(k)) return v;
  }
  return null;
}

function findGrueneTrend(
  trend?: Record<string, Array<{ date: string; value: number }>>
): number | null {
  if (!trend) return null;
  for (const [k, data] of Object.entries(trend)) {
    if (isGruene(k) && data.length >= 2) {
      return Math.round((data[data.length - 1].value - data[data.length - 2].value) * 10) / 10;
    }
  }
  return null;
}

function TrendBadge({ diff }: { diff: number | null }) {
  if (diff == null || diff === 0) return <Minus className="h-3 w-3 text-grey-400" />;
  return (
    <span
      className={`flex items-center gap-0.5 text-[10px] font-medium ${diff > 0 ? 'text-green-600' : 'text-red-500'}`}
    >
      {diff > 0 ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
      {diff > 0 ? '+' : ''}
      {diff}
    </span>
  );
}

function PartyColumn({
  value,
  color,
  max,
  label,
  trendData,
}: {
  value: number | null;
  color: string;
  max: number;
  label: string;
  trendData?: Array<{ date: string; value: number }>;
}) {
  const height = value != null && max > 0 ? (value / max) * 100 : 0;
  const isG = isGruene(label);

  const weekChange =
    trendData && trendData.length >= 2
      ? Math.round(
          (trendData[trendData.length - 1].value - trendData[trendData.length - 2].value) * 10
        ) / 10
      : null;

  return (
    <div className={`flex flex-col items-center gap-0.5 w-12 shrink-0 ${isG ? 'relative' : ''}`}>
      {isG && (
        <div className="absolute inset-0 -top-2 -bottom-2 bg-green-50 dark:bg-green-950/20 rounded-md -z-10" />
      )}
      <span className="text-xs font-bold tabular-nums">{value != null ? `${value}%` : '—'}</span>
      {weekChange != null && weekChange !== 0 ? (
        <TrendBadge diff={weekChange} />
      ) : (
        <span className="h-3" />
      )}
      <div className="w-full flex items-end justify-center" style={{ height: 160 }}>
        <div
          className="w-full max-w-[2.5rem] rounded-t-sm transition-all"
          style={{ height: `${height}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-[11px] font-bold mt-0.5 truncate w-full text-center" style={{ color }}>
        {label.length > 8 ? label.slice(0, 7) + '.' : label}
      </span>
    </div>
  );
}

function SonntagsfrageChart({
  parliament,
  title,
  subtitle,
}: {
  parliament: string;
  title: string;
  subtitle: string;
}) {
  const { data, isLoading } = usePolls(parliament);

  if (isLoading) return <LoadingSection />;
  if (!data || Object.keys(data.average).length === 0) {
    return (
      <Card>
        <CardContent className="py-lg text-center text-sm text-grey-500">
          Keine Umfragedaten verfügbar.
        </CardContent>
      </Card>
    );
  }

  const partyOrder = getPartyOrder(data.average);
  const maxAvg = Math.max(...Object.values(data.average), 1);

  return (
    <div>
      <h3 className="text-lg font-semibold text-foreground-heading">{title}</h3>
      <p className="text-xs text-grey-500 mb-md">
        {subtitle}
        {data.polls.length > 1 && data.polls[0]?.date && (
          <span className="ml-sm text-grey-400">Letzte Umfrage: {data.polls[0].date}</span>
        )}
      </p>

      <div className="flex items-end gap-3 px-sm justify-center flex-wrap">
        {partyOrder.map((party) => (
          <PartyColumn
            key={party}
            value={data.average[party]}
            color={PARTY_COLORS[party] || '#888'}
            max={maxAvg}
            label={party}
            trendData={data.trend?.[party]}
          />
        ))}
      </div>

      <div className="mt-lg grid grid-cols-1 sm:grid-cols-2 gap-sm">
        {data.polls.length > 1 && (
          <Accordion type="single" collapsible>
            <AccordionItem
              value="einzelumfragen"
              className="border border-grey-200 dark:border-grey-700 rounded-lg overflow-hidden"
            >
              <AccordionTrigger className="px-md py-sm text-sm font-medium text-foreground hover:bg-grey-50 dark:hover:bg-grey-800/50 hover:no-underline">
                {data.polls.length} Einzelumfragen
              </AccordionTrigger>
              <AccordionContent className="px-md">
                <div className="space-y-md">
                  {data.polls.map((poll, i) => {
                    const pollMax = Math.max(
                      ...Object.values(poll.parties).filter((v): v is number => v != null),
                      1
                    );
                    return (
                      <div key={`${poll.institute}-${i}`}>
                        <div className="flex items-center justify-between mb-xs">
                          <span className="text-xs font-medium text-foreground">
                            {poll.institute}
                          </span>
                          <span className="text-[11px] text-grey-400">{poll.date}</span>
                        </div>
                        <div className="space-y-0.5">
                          {partyOrder.map((party) => {
                            const val = poll.parties[party];
                            if (val == null) return null;
                            const width = pollMax > 0 ? (val / pollMax) * 100 : 0;
                            return (
                              <div key={party} className="flex items-center gap-xs">
                                <span
                                  className="w-10 text-[10px] font-bold truncate text-right shrink-0"
                                  style={{ color: PARTY_COLORS[party] || '#888' }}
                                >
                                  {party.length > 5 ? party.slice(0, 5) : party}
                                </span>
                                <div className="flex-1 h-3 rounded-full bg-grey-100 dark:bg-grey-800 overflow-hidden">
                                  <div
                                    className="h-full rounded-full"
                                    style={{
                                      width: `${width}%`,
                                      backgroundColor: PARTY_COLORS[party] || '#888',
                                    }}
                                  />
                                </div>
                                <span className="w-8 text-[10px] tabular-nums text-right shrink-0">
                                  {val}%
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}

        <Accordion type="single" collapsible>
          <AccordionItem
            value="politpro-info"
            className="border border-grey-200 dark:border-grey-700 rounded-lg overflow-hidden"
          >
            <AccordionTrigger className="px-md py-sm text-sm font-medium text-foreground hover:bg-grey-50 dark:hover:bg-grey-800/50 hover:no-underline">
              Daten: PolitPro
            </AccordionTrigger>
            <AccordionContent className="px-md">
              <div className="text-xs text-foreground/80 space-y-sm">
                <p>
                  PolitPro ist Europas führende Plattform für Wahltrends und politische Daten.
                  Sonntagsfragen aus Wissenschaft und Meinungsforschung werden zu wöchentlichen
                  Durchschnittswerten aggregiert.
                </p>
                <p>
                  Politisch unabhängig, genutzt von CNN, ORF, MDR, Bundestag und Nationalrat.
                  Aktuell <strong>74 Parlamente</strong> und über{' '}
                  <strong>21.000 Sonntagsfragen</strong>.
                </p>
                <p className="text-grey-400">
                  Der PolitPro Score bewertet die Zuverlässigkeit von Instituten anhand historischer
                  Umfragedaten und Wahlergebnisse.
                </p>
                <a
                  href="https://politpro.eu"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-primary-600 hover:underline"
                >
                  politpro.eu
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  );
}

function formatPollDate(dateStr?: string): string {
  if (!dateStr) return '';
  // PolitPro returns German dates like "5. März 2026" — use as-is
  // ISO dates like "2026-03-15" get formatted
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr.replace(/\s*\d{4}$/, '');
  return d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
}

function LandCard({
  id,
  name,
  isSelected,
  onClick,
}: {
  id: string;
  name: string;
  isSelected: boolean;
  onClick: () => void;
}) {
  const { data } = usePolls(id);
  const grueneValue = data ? findGrueneValue(data.average) : null;
  const grueneTrend = data ? findGrueneTrend(data.trend) : null;
  // Only show date if we have real institute polls (not just the interpolated PolitPro aggregate)
  const lastDate = data && data.polls.length > 1 ? data.polls[0]?.date : undefined;

  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-between gap-xs p-sm rounded-lg border transition-all text-left w-full
        ${
          isSelected
            ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/30 shadow-sm'
            : 'border-grey-200 dark:border-grey-700 hover:border-grey-300 dark:hover:border-grey-600 hover:shadow-sm'
        }`}
    >
      <div className="min-w-0 flex items-baseline gap-xs">
        <span
          className={`text-xs font-medium truncate ${isSelected ? 'text-primary-700 dark:text-primary-400' : 'text-foreground'}`}
        >
          {name}
        </span>
        {lastDate && (
          <span className="text-[9px] text-grey-400 shrink-0">{formatPollDate(lastDate)}</span>
        )}
      </div>
      <div className="flex items-center gap-xs shrink-0">
        {grueneValue != null ? (
          <span className="text-sm font-bold text-green-600 tabular-nums">{grueneValue}%</span>
        ) : (
          <span className="text-xs text-grey-300">—</span>
        )}
      </div>
    </button>
  );
}

function useSortedLaender() {
  const pollResults = LAENDER.map((land) => {
    // Hook count is constant (LAENDER is static), so this is safe
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { data } = usePolls(land.id);
    return { ...land, data };
  });

  return useMemo(() => {
    return [...pollResults].sort((a, b) => {
      const aVal = a.data ? (findGrueneValue(a.data.average) ?? 0) : 0;
      const bVal = b.data ? (findGrueneValue(b.data.average) ?? 0) : 0;
      return bVal - aVal;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollResults.map((q) => q.data?.scrapedAt).join()]);
}

export function UmfragenView({ locale }: UmfragenViewProps) {
  const [selectedLand, setSelectedLand] = useState<string | null>(null);
  const sortedLaender = useSortedLaender();

  if (locale === 'at') {
    return (
      <div>
        <SonntagsfrageChart
          parliament="oesterreich"
          title="Sonntagsfrage — Österreich"
          subtitle="Wenn am nächsten Sonntag Nationalratswahl wäre… Wöchentlich aggregierter Durchschnitt."
        />
      </div>
    );
  }

  const activeParliament = selectedLand ?? 'deutschland';
  const activeTitle = selectedLand
    ? `Sonntagsfrage — ${LAENDER.find((l) => l.id === selectedLand)?.name ?? selectedLand}`
    : 'Sonntagsfrage';
  const activeSubtitle = selectedLand
    ? 'Wenn am nächsten Sonntag Landtagswahl wäre… Wöchentlich aggregierter Durchschnitt.'
    : 'Wenn am nächsten Sonntag Bundestagswahl wäre… Wöchentlich aggregierter Durchschnitt.';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-lg items-start">
      <div>
        <SonntagsfrageChart
          key={activeParliament}
          parliament={activeParliament}
          title={activeTitle}
          subtitle={activeSubtitle}
        />
      </div>

      <div>
        <p className="text-xs font-semibold text-foreground-heading uppercase tracking-wide mb-sm">
          Grüne in den Ländern
        </p>
        <div className="grid grid-cols-2 gap-xs">
          <button
            onClick={() => setSelectedLand(null)}
            className={`col-span-2 flex items-center justify-between gap-xs p-sm rounded-lg border transition-all text-left w-full
              ${
                !selectedLand
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/30 shadow-sm'
                  : 'border-grey-200 dark:border-grey-700 hover:border-grey-300 dark:hover:border-grey-600 hover:shadow-sm'
              }`}
          >
            <p
              className={`text-xs font-semibold ${!selectedLand ? 'text-primary-700 dark:text-primary-400' : 'text-foreground'}`}
            >
              Bundestrend
            </p>
            <span className="text-[10px] text-grey-400">Deutschland</span>
          </button>
          {sortedLaender.map((land) => (
            <LandCard
              key={land.id}
              id={land.id}
              name={land.name}
              isSelected={selectedLand === land.id}
              onClick={() => setSelectedLand(selectedLand === land.id ? null : land.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
