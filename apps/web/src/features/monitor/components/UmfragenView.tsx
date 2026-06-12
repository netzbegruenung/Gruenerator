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

import { AT_BUNDESLAENDER, BUNDESLAENDER } from '../bundeslaender';
import { useEuGreens, useEuGreensHistory, usePolls } from '../hooks/useMonitor';
import { PARTY_COLORS } from '../partyColors';

import { MeinungsbildSection } from './MeinungsbildSection';
import {
  EuGreenPartyPanel,
  EuGreensElectionDiffChart,
  EuGreensTrendSection,
  SonntagsfrageTrendSection,
  Sparkline,
} from './PollTrendCharts';

import type { MonitorLocale } from '../hooks/useMonitor';

interface UmfragenViewProps {
  locale: MonitorLocale;
  /**
   * 'overview' renders a flat summary (chart + Länder grid only) for the
   * Überblick tab; 'full' adds detail accordions, trend charts and the
   * EU greens deck on the Umfragen tab.
   */
  variant?: 'full' | 'overview';
}

// Re-exported for BundeslandView (imports colors + chart from here).
export { PARTY_COLORS };

// Compact labels for the tight 2-column "Grüne in den Ländern" grid.
const LAENDER = BUNDESLAENDER.map((b) => ({ id: b.id, name: b.display ?? b.name }));

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
  officialDiff,
}: {
  value: number | null;
  color: string;
  max: number;
  label: string;
  trendData?: Array<{ date: string; value: number }>;
  /** Official week-over-week change from the PolitPro API, when available. */
  officialDiff?: number;
}) {
  const height = value != null && max > 0 ? (value / max) * 100 : 0;
  const isG = isGruene(label);

  const computedChange =
    trendData && trendData.length >= 2
      ? Math.round(
          (trendData[trendData.length - 1].value - trendData[trendData.length - 2].value) * 10
        ) / 10
      : null;
  const weekChange = officialDiff ?? computedChange;

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

/** ISO country code → flag emoji ('eu' resolves to the EU flag). */
function flagEmoji(code: string): string {
  return code
    .toUpperCase()
    .replace(/[A-Z]/g, (c) => String.fromCodePoint(0x1f1a5 + c.charCodeAt(0)));
}

export function EuGreensDeck() {
  const { data } = useEuGreens();
  const { data: history } = useEuGreensHistory();
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);

  if (!data || data.results.length === 0) return null;

  const seriesByCountry = new Map(history?.series.map((s) => [s.countryCode, s]) ?? []);
  const selected = selectedCountry
    ? data.results.find((r) => r.countryCode === selectedCountry)
    : undefined;

  return (
    <div className="mt-xl border-t border-grey-200 dark:border-grey-700 pt-xl">
      <h3 className="text-lg font-semibold text-foreground-heading">Grüne in Europa</h3>
      <p className="text-xs text-grey-500 mb-md">
        Aktuelle Wahltrends grüner Parteien in europäischen Parlamenten. Quelle:{' '}
        <a
          href="https://politpro.eu"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary-600 hover:underline"
        >
          PolitPro.eu
        </a>
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-xs">
        {data.results.map((r) => {
          const isSelected = selectedCountry === r.countryCode;
          return (
            <button
              key={r.countryCode}
              title={r.note ?? undefined}
              onClick={() => setSelectedCountry(isSelected ? null : r.countryCode)}
              className={`flex items-center justify-between gap-xs p-sm rounded-lg border text-left transition-all ${
                isSelected
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/30 shadow-sm'
                  : 'border-grey-200 dark:border-grey-700 hover:border-grey-300 dark:hover:border-grey-600 hover:shadow-sm'
              }`}
            >
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground truncate">
                  <span className="mr-xs">{flagEmoji(r.countryCode)}</span>
                  {r.countryName}
                </p>
                <p className="text-[10px] text-grey-400 truncate">
                  {r.party}
                  {r.note && <span> *</span>}
                </p>
              </div>
              <div className="flex items-center gap-xs shrink-0">
                {seriesByCountry.has(r.countryCode) && (
                  <Sparkline points={seriesByCountry.get(r.countryCode)!.points} />
                )}
                {r.diff != null && r.diff !== 0 && <TrendBadge diff={r.diff} />}
                <span className="text-sm font-bold text-green-600 tabular-nums">{r.percent}%</span>
              </div>
            </button>
          );
        })}
      </div>
      <p className="mt-xs text-[10px] text-grey-400">
        * Grüne treten dort als Teil einer breiteren Liste/Allianz an. Länder ohne separat
        ausgewiesenes grünes Ergebnis (z.&nbsp;B. Frankreich, Spanien, Polen, Belgien) sind nicht
        aufgeführt.
      </p>

      {selected && (
        <EuGreenPartyPanel
          key={selected.countryCode}
          result={selected}
          points={seriesByCountry.get(selected.countryCode)?.points}
        />
      )}

      {history && history.series.length > 0 && (
        <Accordion
          type="single"
          collapsible
          className="mt-sm border border-grey-200 dark:border-grey-700 rounded-lg overflow-hidden"
        >
          <AccordionItem value="eu-trends">
            <AccordionTrigger className="px-md py-sm text-sm font-medium text-foreground hover:bg-grey-50 dark:hover:bg-grey-800/50 hover:no-underline">
              Erweiterte Ansicht: Trends &amp; Vergleich
            </AccordionTrigger>
            <AccordionContent className="px-md pb-md">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-lg items-start">
                <EuGreensTrendSection history={history} />
                <EuGreensElectionDiffChart results={data.results} />
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
    </div>
  );
}

export function SonntagsfrageChart({
  parliament,
  title,
  subtitle,
  showDetails = true,
}: {
  parliament: string;
  title: string;
  subtitle: string;
  /** false renders only the bar chart (no detail accordions) — Überblick. */
  showDetails?: boolean;
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
          <span className="ml-sm text-grey-400">
            Letzte Umfrage: {formatPollDate(data.polls[0].date)}
          </span>
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
            officialDiff={data.diffs?.[party]}
          />
        ))}
      </div>

      {!showDetails ? null : (
        <>
          <div className="mt-lg grid grid-cols-1 sm:grid-cols-2 gap-sm">
            {data.polls.length > 1 && (
              <Accordion
                type="single"
                collapsible
                className="border border-grey-200 dark:border-grey-700 rounded-lg overflow-hidden"
              >
                <AccordionItem value="einzelumfragen">
                  <AccordionTrigger className="px-md py-sm text-sm font-medium text-foreground hover:bg-grey-50 dark:hover:bg-grey-800/50 hover:no-underline">
                    {data.polls.length} Einzelumfragen
                  </AccordionTrigger>
                  <AccordionContent className="px-md">
                    <div className="space-y-md">
                      {data.polls.map((poll) => {
                        const pollMax = Math.max(
                          ...Object.values(poll.parties).filter((v): v is number => v != null),
                          1
                        );
                        return (
                          <div key={`${poll.institute}-${poll.date}`}>
                            <div className="flex items-center justify-between mb-xs">
                              <span className="flex items-baseline gap-xs min-w-0">
                                <span className="text-xs font-medium text-foreground truncate">
                                  {poll.institute}
                                </span>
                                {poll.instituteScore != null && (
                                  <span
                                    className="text-[9px] text-grey-400 shrink-0"
                                    title="PolitPro Score: Zuverlässigkeit des Instituts (0–100)"
                                  >
                                    Score {poll.instituteScore}
                                  </span>
                                )}
                              </span>
                              <span className="text-[11px] text-grey-400 shrink-0">
                                {poll.sampleSize != null && (
                                  <span className="mr-xs">
                                    n={poll.sampleSize.toLocaleString('de-DE')}
                                  </span>
                                )}
                                {formatPollDate(poll.date)}
                              </span>
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

            <Accordion
              type="single"
              collapsible
              className="border border-grey-200 dark:border-grey-700 rounded-lg overflow-hidden"
            >
              <AccordionItem value="politpro-info">
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
                      Der PolitPro Score bewertet die Zuverlässigkeit von Instituten anhand
                      historischer Umfragedaten und Wahlergebnisse.
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

          <Accordion
            type="single"
            collapsible
            className="mt-sm border border-grey-200 dark:border-grey-700 rounded-lg overflow-hidden"
          >
            <AccordionItem value="trendverlauf">
              <AccordionTrigger className="px-md py-sm text-sm font-medium text-foreground hover:bg-grey-50 dark:hover:bg-grey-800/50 hover:no-underline">
                Trendverlauf &amp; Einzelumfragen
              </AccordionTrigger>
              <AccordionContent className="px-md pb-md">
                <SonntagsfrageTrendSection parliament={parliament} />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </>
      )}
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

/**
 * "Grüne in den Ländern" selector grid, sorted by Grüne polling strength.
 * Mounted per locale with a static `laender` list, so the per-card poll
 * hooks keep a constant count.
 */
function LaenderGrid({
  laender,
  nationalLabel,
  nationalSubLabel,
  selected,
  onSelect,
}: {
  laender: Array<{ id: string; name: string }>;
  nationalLabel: string;
  nationalSubLabel: string;
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const pollResults = laender.map((land) => {
    // Hook count is constant (laender is static per mount site), so this is safe
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { data } = usePolls(land.id);
    return { ...land, data };
  });

  const dataFingerprint = pollResults.map((q) => q.data?.scrapedAt).join();

  const sorted = useMemo(() => {
    return [...pollResults].sort((a, b) => {
      const aVal = a.data ? (findGrueneValue(a.data.average) ?? 0) : 0;
      const bVal = b.data ? (findGrueneValue(b.data.average) ?? 0) : 0;
      return bVal - aVal;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataFingerprint]);

  return (
    <div>
      <p className="text-xs font-semibold text-foreground-heading uppercase tracking-wide mb-sm">
        Grüne in den Ländern
      </p>
      <div className="grid grid-cols-2 gap-xs">
        <button
          onClick={() => onSelect(null)}
          className={`col-span-2 flex items-center justify-between gap-xs p-sm rounded-lg border transition-all text-left w-full
            ${
              !selected
                ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/30 shadow-sm'
                : 'border-grey-200 dark:border-grey-700 hover:border-grey-300 dark:hover:border-grey-600 hover:shadow-sm'
            }`}
        >
          <p
            className={`text-xs font-semibold ${!selected ? 'text-primary-700 dark:text-primary-400' : 'text-foreground'}`}
          >
            {nationalLabel}
          </p>
          <span className="text-[10px] text-grey-400">{nationalSubLabel}</span>
        </button>
        {sorted.map((land) => (
          <LandCard
            key={land.id}
            id={land.id}
            name={land.name}
            isSelected={selected === land.id}
            onClick={() => onSelect(selected === land.id ? null : land.id)}
          />
        ))}
      </div>
    </div>
  );
}

const AT_LAENDER = AT_BUNDESLAENDER.map((b) => ({ id: b.id, name: b.display ?? b.name }));

export function UmfragenView({ locale, variant = 'full' }: UmfragenViewProps) {
  const [selectedLand, setSelectedLand] = useState<string | null>(null);
  const isFull = variant === 'full';

  if (locale === 'at') {
    const activeParliament = selectedLand ?? 'oesterreich';
    const activeTitle = selectedLand
      ? `Sonntagsfrage — ${AT_LAENDER.find((l) => l.id === selectedLand)?.name ?? selectedLand}`
      : 'Sonntagsfrage — Österreich';
    const activeSubtitle = selectedLand
      ? 'Wenn am nächsten Sonntag Landtagswahl wäre… Wöchentlich aggregierter Durchschnitt.'
      : 'Wenn am nächsten Sonntag Nationalratswahl wäre… Wöchentlich aggregierter Durchschnitt.';

    return (
      <div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-lg items-start">
          <div>
            <SonntagsfrageChart
              key={activeParliament}
              parliament={activeParliament}
              title={activeTitle}
              subtitle={activeSubtitle}
              showDetails={isFull}
            />
          </div>
          <LaenderGrid
            laender={AT_LAENDER}
            nationalLabel="Bundestrend"
            nationalSubLabel="Österreich"
            selected={selectedLand}
            onSelect={setSelectedLand}
          />
        </div>
        {isFull && <EuGreensDeck />}
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
    <div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-lg items-start">
        <div>
          <SonntagsfrageChart
            key={activeParliament}
            parliament={activeParliament}
            title={activeTitle}
            subtitle={activeSubtitle}
            showDetails={isFull}
          />
        </div>
        <LaenderGrid
          laender={LAENDER}
          nationalLabel="Bundestrend"
          nationalSubLabel="Deutschland"
          selected={selectedLand}
          onSelect={setSelectedLand}
        />
      </div>

      {isFull && <EuGreensDeck />}

      <MeinungsbildSection />
    </div>
  );
}
