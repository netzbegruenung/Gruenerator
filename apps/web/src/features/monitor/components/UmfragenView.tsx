import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Card,
  CardContent,
  LoadingSection,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@gruenerator/ui';
import { ChevronLeft, ChevronRight, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';

import { AT_BUNDESLAENDER, bundeslandById, BUNDESLAENDER } from '../bundeslaender';
import { useEuGreens, useEuGreensHistory, usePolls } from '../hooks/useMonitor';
import { PARTY_COLORS } from '../partyColors';

import { GerdaAttribution, LandtagsergebnisCard, MeinungsbildForState } from './LandDetails';
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
  /** Hide the Meinungsbild blocks (used when embedded in the Übersicht tab). */
  showMeinungsbild?: boolean;
}

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

function ChartSlide({
  label,
  sublabel,
  values,
  partyOrder,
  trend,
  diffs,
}: {
  label: string;
  /** Secondary line under the label (e.g. institute score and sample size). */
  sublabel?: string;
  values: Record<string, number | null | undefined>;
  partyOrder: string[];
  trend?: Record<string, Array<{ date: string; value: number }>>;
  /** Official week-over-week changes from the PolitPro API (average slide only). */
  diffs?: Record<string, number | undefined>;
}) {
  const present = partyOrder.filter((p) => values[p] != null);
  const max = Math.max(...present.map((p) => values[p] ?? 0), 1);

  return (
    <div className="w-full shrink-0 snap-center">
      <div className="text-center mb-sm">
        <p className="text-xs font-medium text-grey-500">{label}</p>
        {sublabel && <p className="text-[10px] text-grey-400">{sublabel}</p>}
      </div>
      <div className="flex items-end gap-3 px-sm justify-center flex-wrap">
        {present.map((party) => (
          <PartyColumn
            key={party}
            value={values[party] ?? null}
            color={PARTY_COLORS[party] || '#888'}
            max={max}
            label={party}
            trendData={trend?.[party]}
            officialDiff={diffs?.[party]}
          />
        ))}
      </div>
    </div>
  );
}

const POLITPRO_EXPLANATION =
  'PolitPro ist Europas führende Plattform für Wahltrends und politische Daten. Sonntagsfragen aus ' +
  'Wissenschaft und Meinungsforschung werden zu wöchentlichen Durchschnittswerten aggregiert. ' +
  'Politisch unabhängig, genutzt von CNN, ORF, MDR, Bundestag und Nationalrat — aktuell 74 Parlamente ' +
  'und über 21.000 Sonntagsfragen. Der PolitPro Score bewertet die Zuverlässigkeit von Instituten ' +
  'anhand historischer Umfragedaten und Wahlergebnisse.';

/** "Score 87 · n=1.502" — per-poll metadata from the PolitPro API. */
function pollSublabel(poll: { instituteScore?: number | null; sampleSize?: number | null }) {
  const parts = [
    poll.instituteScore != null ? `Score ${poll.instituteScore}` : null,
    poll.sampleSize != null ? `n=${poll.sampleSize.toLocaleString('de-DE')}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

export function SonntagsfrageChart({
  parliament,
  title,
  subtitle,
  showDetails = true,
}: {
  parliament: string;
  /** Omit when an external header (e.g. SectionHeader) already labels the chart. */
  title?: string;
  subtitle: string;
  /** false renders only the chart carousel (no trend accordion) — Überblick. */
  showDetails?: boolean;
}) {
  const { data, isLoading } = usePolls(parliament);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeSlide, setActiveSlide] = useState(0);

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
  // polls[0] alone is just the interpolated PolitPro aggregate — only real
  // institute polls become swipeable slides.
  const polls = data.polls.length > 1 ? data.polls : [];
  const slideCount = 1 + polls.length;

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el || el.clientWidth === 0) return;
    setActiveSlide(
      Math.max(0, Math.min(slideCount - 1, Math.round(el.scrollLeft / el.clientWidth)))
    );
  };

  const scrollToSlide = (i: number) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  };

  return (
    <div>
      {title && <h3 className="text-lg font-semibold text-foreground-heading">{title}</h3>}
      <p className="text-xs text-grey-500 mb-md">
        {subtitle}
        {polls.length > 0 && polls[0]?.date && (
          <span className="ml-sm text-grey-400">
            Letzte Umfrage: {formatPollDate(polls[0].date)}
          </span>
        )}
      </p>

      <div className="relative">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <ChartSlide
            label="Ø PolitPro-Durchschnitt"
            values={data.average}
            partyOrder={partyOrder}
            trend={data.trend}
            diffs={data.diffs}
          />
          {polls.map((poll, i) => (
            <ChartSlide
              key={`${poll.institute}-${i}`}
              label={`${poll.institute}${poll.date ? ` · ${formatPollDate(poll.date)}` : ''}`}
              sublabel={pollSublabel(poll)}
              values={poll.parties}
              partyOrder={partyOrder}
            />
          ))}
        </div>

        {activeSlide > 0 && (
          <button
            onClick={() => scrollToSlide(activeSlide - 1)}
            aria-label="Vorherige Umfrage"
            className="absolute left-0 top-1/2 -translate-y-1/2 p-1 rounded-full border border-grey-200 dark:border-grey-700 bg-background text-grey-400 hover:text-foreground transition-colors cursor-pointer"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
        {activeSlide < slideCount - 1 && (
          <button
            onClick={() => scrollToSlide(activeSlide + 1)}
            aria-label="Nächste Umfrage"
            className="absolute right-0 top-1/2 -translate-y-1/2 p-1 rounded-full border border-grey-200 dark:border-grey-700 bg-background text-grey-400 hover:text-foreground transition-colors cursor-pointer"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="mt-md flex items-center justify-center gap-md">
        {slideCount > 1 && (
          <div className="flex items-center gap-1.5">
            {Array.from({ length: slideCount }, (_, i) => (
              <button
                key={i}
                onClick={() => scrollToSlide(i)}
                aria-label={i === 0 ? 'Ø Durchschnitt' : `Einzelumfrage ${i}`}
                className={`h-1.5 rounded-full border-none p-0 cursor-pointer transition-all ${
                  i === activeSlide
                    ? 'w-4 bg-grey-500 dark:bg-grey-300'
                    : 'w-1.5 bg-grey-200 dark:bg-grey-700 hover:bg-grey-300 dark:hover:bg-grey-600'
                }`}
              />
            ))}
          </div>
        )}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <a
                href="https://politpro.eu"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-grey-400 hover:text-foreground transition-colors underline decoration-dotted underline-offset-2"
              >
                Daten: PolitPro
              </a>
            </TooltipTrigger>
            <TooltipContent className="w-72 max-w-[90vw] text-left">
              {POLITPRO_EXPLANATION}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {showDetails && (
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

export function UmfragenView({ locale, showMeinungsbild = true }: UmfragenViewProps) {
  const [selectedLand, setSelectedLand] = useState<string | null>(null);

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
        <EuGreensDeck />
      </div>
    );
  }

  const land = selectedLand ? bundeslandById(selectedLand) : undefined;
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
        <div className="space-y-xl">
          <SonntagsfrageChart
            key={activeParliament}
            parliament={activeParliament}
            title={activeTitle}
            subtitle={activeSubtitle}
          />
          {land && <LandtagsergebnisCard code={land.code} />}
        </div>
        <LaenderGrid
          laender={LAENDER}
          nationalLabel="Bundestrend"
          nationalSubLabel="Deutschland"
          selected={selectedLand}
          onSelect={setSelectedLand}
        />
      </div>

      <EuGreensDeck />

      {land ? (
        <div className="mt-xl border-t border-grey-200 dark:border-grey-700 pt-xl space-y-lg">
          {showMeinungsbild && <MeinungsbildForState code={land.code} stateName={land.name} />}
          <GerdaAttribution />
        </div>
      ) : showMeinungsbild ? (
        <MeinungsbildSection />
      ) : null}
    </div>
  );
}
