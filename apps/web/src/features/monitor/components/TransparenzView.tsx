/**
 * Platform transparency — what the whole Grünerator consumes.
 *
 * The sibling of the personal "Nutzung" tab, and deliberately NOT the same
 * page with a bigger number in it. Three things change once a figure describes
 * everybody rather than you:
 *
 *  - It is published as a BAND, never a point. The width of the band is the
 *    remaining uncertainty from lanes no provider meters, and it narrows on its
 *    own as coverage grows.
 *  - The constants behind the arithmetic are on the page (grid intensity, PUE,
 *    per provider). A footprint nobody can recompute is an assertion.
 *  - Days with fewer than `min_group_size` active users are missing from the
 *    series, and the gap is labelled as suppression rather than left to read as
 *    a quiet weekend.
 *
 * Charts are hand-rolled SVG/CSS, like everywhere else in Monitor — a charting
 * library would be a lot of bundle for three dozen numbers.
 */
import {
  type GetTransparencyStatsResponseDto,
  type TransparencyDayEntryDto,
  type TransparencyFeatureEntryDto,
  type TransparencyFootprintDto,
  type TransparencyLocale,
  type TransparencyProviderEntryDto,
  type UsageFeature,
} from '@gruenerator/contracts';
import { getPinnedLocale } from '@gruenerator/shared/instances';
import { cn, LoadingSection, StatusBanner } from '@gruenerator/ui';
import { useSearchParams } from 'react-router-dom';

import { CURRENT_INSTANCE } from '../../../config/instance';
import { getDocsUrl } from '../../../utils/docsUrl';
import {
  carComparison,
  FEATURE_LABELS,
  formatCount,
  formatDay,
  formatDuration,
  formatEnergy,
  formatGrams,
  formatTokens,
  FUNCTION_LABELS,
  FUNCTION_ORDER,
  oneDecimal,
  providerLabel,
  formatCorridor,
  referenceComparison,
  UNIT_LABELS,
} from '../../../utils/usageFormat';
import { useTransparencyStats } from '../hooks/useTransparency';

import { PillButton } from './MonitorPageHeader';
import {
  MONITOR_ACCENT,
  MONITOR_BODY,
  MONITOR_CARD,
  MONITOR_EYEBROW,
  MONITOR_FAINT,
  MONITOR_HEADING,
  MONITOR_MUTED,
  MONITOR_PILL_TRACK,
  MONITOR_TAG,
} from './theme';

const RANGES = [7, 30, 90] as const;
export const DEFAULT_DAYS = 30;

const DOCS_LINK = `${getDocsUrl()}/docs/basics/nachhaltigkeit`;

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/* ── Zeitraum ─────────────────────────────────────────────────────────────── */

/**
 * The range lives in the URL so a figure can be linked to. Like the monitor
 * locale param, the default is deleted from the query string rather than
 * written out, so the bare path stays the canonical one.
 */
export function useDaysParam(): { days: number; setDays: (d: number) => void } {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = Number(searchParams.get('days'));
  const days = RANGES.includes(raw as (typeof RANGES)[number]) ? raw : DEFAULT_DAYS;

  const setDays = (next: number) => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next === DEFAULT_DAYS) params.delete('days');
        else params.set('days', String(next));
        return params;
      },
      { replace: true }
    );
  };

  return { days, setDays };
}

/* ── Ansicht wählen ───────────────────────────────────────────────────────── */

/**
 * Two renderings of the same response: the simple one (default) shows only CO2
 * grouped by what people did; the expert one keeps every constant and share.
 * Like the range, the choice lives in the URL so either view can be linked to,
 * and the default is deleted rather than written out.
 */
export function useExpertParam(): { expert: boolean; setExpert: (v: boolean) => void } {
  const [searchParams, setSearchParams] = useSearchParams();
  const expert = searchParams.get('ansicht') === 'experten';

  const setExpert = (next: boolean) => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next) params.set('ansicht', 'experten');
        else params.delete('ansicht');
        return params;
      },
      { replace: true }
    );
  };

  return { expert, setExpert };
}

export function ViewSwitcher({
  expert,
  onChange,
}: {
  expert: boolean;
  onChange: (expert: boolean) => void;
}) {
  return (
    <div className={MONITOR_PILL_TRACK}>
      <PillButton size="sm" active={!expert} onClick={() => onChange(false)}>
        Einfache Übersicht
      </PillButton>
      <PillButton size="sm" active={expert} onClick={() => onChange(true)}>
        Expert*innenübersicht
      </PillButton>
    </div>
  );
}

/* ── Land wählen ──────────────────────────────────────────────────────────── */

const LOCALE_LABELS: Record<TransparencyLocale, string> = {
  de: 'Deutschland',
  at: 'Österreich',
};

function isTransparencyLocale(value: string | null): value is TransparencyLocale {
  return value === 'de' || value === 'at';
}

/**
 * Which country's users the figure describes; `null` is the whole instance and
 * the default. Unlike the monitor's locale param this does NOT default from the
 * profile: the platform total is the figure this page exists for, and the
 * split is a drill-down into it.
 *
 * An instance that pins its locale (bgst) has nothing to split, so the param
 * is ignored there and `available` tells the page not to offer the switch.
 */
export function useTransparencyLocaleParam(): {
  locale: TransparencyLocale | null;
  setLocale: (locale: TransparencyLocale | null) => void;
  available: boolean;
} {
  const [searchParams, setSearchParams] = useSearchParams();
  const available = getPinnedLocale(CURRENT_INSTANCE) === null;
  const raw = searchParams.get('locale');
  const locale = available && isTransparencyLocale(raw) ? raw : null;

  const setLocale = (next: TransparencyLocale | null) => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next) params.set('locale', next);
        else params.delete('locale');
        return params;
      },
      { replace: true }
    );
  };

  return { locale, setLocale, available };
}

export function LocaleSwitcher({
  locale,
  onChange,
}: {
  locale: TransparencyLocale | null;
  onChange: (locale: TransparencyLocale | null) => void;
}) {
  return (
    <div className={MONITOR_PILL_TRACK}>
      <PillButton size="sm" active={locale === null} onClick={() => onChange(null)}>
        Alle
      </PillButton>
      {(Object.keys(LOCALE_LABELS) as TransparencyLocale[]).map((entry) => (
        <PillButton key={entry} size="sm" active={locale === entry} onClick={() => onChange(entry)}>
          {LOCALE_LABELS[entry]}
        </PillButton>
      ))}
    </div>
  );
}

export function RangeSwitcher({
  days,
  onChange,
}: {
  days: number;
  onChange: (days: number) => void;
}) {
  return (
    <div className={MONITOR_PILL_TRACK}>
      {RANGES.map((range) => (
        <PillButton key={range} size="sm" active={days === range} onClick={() => onChange(range)}>
          {range} Tage
        </PillButton>
      ))}
    </div>
  );
}

/* ── Hero ─────────────────────────────────────────────────────────────────── */

/** Output tokens per day — the quantity the footprint actually scales with. */
/**
 * A published figure and the width of what we do not know about it.
 *
 * The number a reader carries away is the middle; the track under it is the
 * span the middle sits in. Drawn rather than written out because the two are a
 * pair — a point estimate printed alone reads as certainty we do not have, and
 * a bare "x to y" reads as if every value in between were equally likely.
 *
 * The track is linear between the two ends, so the marker's position IS the
 * middle's position in its own span; a middle near the left edge says the
 * uncertainty runs mostly upward. Where low and high coincide (a metered lane
 * in a known country) there is nothing to draw and the caller shows the number
 * alone — an empty scale would imply a precision claim of its own.
 */
function Scale({
  low,
  mid,
  high,
  format,
  lowLabel = 'mindestens',
  highLabel = 'höchstens',
}: {
  low: number;
  mid: number;
  high: number;
  format: (v: number) => string;
  lowLabel?: string;
  highLabel?: string;
}) {
  const span = high - low;
  const pct = span > 0 ? Math.min(100, Math.max(0, ((mid - low) / span) * 100)) : 50;

  return (
    <div className="mt-4 max-w-[26rem]">
      <div
        className="relative h-2 rounded-full bg-[#e4ebe7] dark:bg-grey-800"
        role="img"
        aria-label={`Spanne von ${format(low)} bis ${format(high)}, Schätzwert ${format(mid)}`}
      >
        <div
          className="absolute inset-y-0 rounded-full bg-[#a8cbbb] dark:bg-[#3d6455]"
          style={{ left: 0, right: 0 }}
        />
        <div
          className="absolute top-1/2 h-3.5 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-sm bg-[#316049] dark:bg-[#6fae90]"
          style={{ left: `${pct}%` }}
        />
      </div>
      <div className={cn('mt-1.5 flex justify-between text-[0.75rem]', MONITOR_FAINT)}>
        <span>
          {lowLabel} {format(low)}
        </span>
        <span>
          {highLabel} {format(high)}
        </span>
      </div>
    </div>
  );
}

/** True when the two ends are far enough apart to be worth drawing. */
function hasSpan(low: number, high: number): boolean {
  return high - low > Math.max(0.5, high * 0.005);
}

function HeroSparkline({ points }: { points: TransparencyDayEntryDto[] }) {
  const series = points.slice(-12).map((p) => p.output_tokens);
  if (series.length < 2) return null;

  const W = 260;
  const H = 72;
  const P = 6;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const range = max - min || 1;
  const coords = series.map(
    (v, i) =>
      [
        P + (i * (W - 2 * P)) / (series.length - 1),
        H - P - ((v - min) / range) * (H - 2 * P),
      ] as const
  );
  const line = 'M' + coords.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L');
  const last = coords[coords.length - 1];
  const fill = `${line} L${last[0].toFixed(1)} ${H - P} L${coords[0][0].toFixed(1)} ${H - P} Z`;

  return (
    <div className="flex flex-col items-end gap-1.5">
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        className="max-w-full overflow-visible"
        role="img"
        aria-label={`Verlauf der erzeugten Tokens über die letzten ${series.length} erfassten Tage`}
      >
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
      <span className={cn('text-[12px]', MONITOR_FAINT)}>
        Erzeugte Tokens · letzte {series.length} erfasste Tage
      </span>
    </div>
  );
}

/**
 * The headline figure: the central estimate, with its scale drawn under it.
 *
 * It used to be the upper end, on the reasoning that a lone number should be
 * the one that cannot flatter us. That reasoning produced a number reliably
 * wrong in one direction and hid how wide the real uncertainty was. The ends
 * are now drawn beside the middle instead of standing in for it — see `Scale`.
 */
function FootprintHero({
  footprint,
  daily,
  days,
}: {
  footprint: TransparencyFootprintDto;
  daily: TransparencyDayEntryDto[];
  days: number;
}) {
  const co2Span = hasSpan(footprint.emissions_g_low, footprint.emissions_g_high);
  const energySpan = hasSpan(footprint.energy_wh_low, footprint.energy_wh_high);

  return (
    <div className={cn('mb-10 flex flex-wrap items-start justify-between gap-8 p-8', MONITOR_CARD)}>
      <div>
        <p className={cn('m-0 mb-1', MONITOR_EYEBROW)}>CO₂ der letzten {days} Tage</p>
        <div className="flex flex-wrap items-baseline gap-3.5">
          <span
            className={cn(
              'text-[3.4rem] font-semibold leading-none tracking-[-0.03em]',
              MONITOR_HEADING
            )}
          >
            ≈ {formatGrams(footprint.emissions_g)}
          </span>
          <span className={cn('text-[1.1rem] font-bold', MONITOR_ACCENT)}>CO₂e</span>
        </div>
        {co2Span && (
          <Scale
            low={footprint.emissions_g_low}
            mid={footprint.emissions_g}
            high={footprint.emissions_g_high}
            format={formatGrams}
          />
        )}
        <p className={cn('m-0 mt-4 text-[0.9rem]', MONITOR_MUTED)}>
          {formatEnergy(footprint.energy_wh)} Strom · so viel wie{' '}
          {carComparison(footprint.emissions_g)}
          {footprint.image_emissions_g > 0 && (
            <> · davon {formatGrams(footprint.image_emissions_g)} aus erzeugten Bildern</>
          )}
        </p>
        {energySpan && (
          <Scale
            low={footprint.energy_wh_low}
            mid={footprint.energy_wh}
            high={footprint.energy_wh_high}
            format={formatEnergy}
          />
        )}
      </div>
      <HeroSparkline points={daily} />
    </div>
  );
}

/* ── Anbieter ─────────────────────────────────────────────────────────────── */

/**
 * Where the emissions went, and with which constants they were costed.
 *
 * This is the part that makes the headline number checkable: grid intensity and
 * PUE are the only two inputs besides kWh, and both are printed next to the
 * share they were applied to.
 *
 * Ranked by CO2, not by energy, because the two orders genuinely differ: the
 * grid factors in this table span a factor of 16, so the biggest consumer of
 * kWh is not the biggest emitter. The page is about the footprint, so it sorts
 * by the footprint — and the bar has to carry the same quantity as the sort,
 * otherwise the rows read as if they were out of order.
 */
function ProviderPanel({ providers }: { providers: TransparencyProviderEntryDto[] }) {
  const ranked = [...providers].sort((a, b) => b.emissions_g - a.emissions_g);
  const max = Math.max(...ranked.map((p) => p.emissions_g), 1);
  const estimatedPue = ranked.some((p) => p.pue_estimated);

  return (
    <section>
      <div className="mb-5 flex items-baseline justify-between gap-4">
        <h2 className={cn('m-0 text-[1.35rem] font-semibold tracking-[-0.01em]', MONITOR_HEADING)}>
          Nach Anbieter
        </h2>
        <span className={cn('text-[0.85rem]', MONITOR_FAINT)}>Sortiert nach CO₂</span>
      </div>
      <div className={cn('flex flex-col gap-4 p-6', MONITOR_CARD)}>
        {ranked.map((entry) => (
          <div key={entry.provider} className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className={cn('text-[0.95rem] font-bold', MONITOR_HEADING)}>
                {providerLabel(entry.provider)}
              </span>
              <span className={cn('text-[0.95rem] font-bold tabular-nums', MONITOR_ACCENT)}>
                {formatGrams(entry.emissions_g)} · {formatEnergy(entry.energy_wh)}
              </span>
            </div>
            <div className="h-[18px] overflow-hidden rounded-md bg-[#eef2ef] dark:bg-grey-800">
              <div
                className="h-full rounded-md bg-[#52907a] transition-[width] duration-500"
                style={{ width: `${(entry.emissions_g / max) * 100}%` }}
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <span className={MONITOR_TAG}>
                Netz {oneDecimal.format(entry.grid_g_per_kwh)} g/kWh
              </span>
              <span className={MONITOR_TAG}>
                PUE {entry.pue_estimated ? '≈' : ''}
                {oneDecimal.format(entry.pue)}
              </span>
              {entry.pue_estimated && (
                <span className={MONITOR_TAG} title="Vom Betreiber nicht veröffentlicht">
                  PUE geschätzt
                </span>
              )}
            </div>
          </div>
        ))}
        <p className={cn('m-0 mt-1 text-[0.8rem] leading-relaxed', MONITOR_FAINT)}>
          Emissionen = Energie × Netzintensität, standortbasiert. Die Netzintensität ist der
          Jahresdurchschnitt des Landes, in dem der Anbieter rechnet — kein Zertifikatehandel, und
          nur Verbrennungsemissionen: Kraftwerksbau und Brennstoffkette sind nicht enthalten, was
          kohlenstoffarme Netze deutlich günstiger aussehen lässt. PUE ist der Aufschlag des
          Rechenzentrums für Kühlung und Verluste; er steckt bereits in der gezeigten Energie.
          {estimatedPue && (
            <>
              {' '}
              Wo <strong>PUE geschätzt</strong> steht, veröffentlicht der Betreiber keinen Wert. Wir
              schätzen dann über den Standort — für Deutschland mit der gesetzlichen Obergrenze des
              Energieeffizienzgesetzes (1,5), sonst mit dem europäischen Durchschnitt (1,50).
              Europäisch und nicht weltweit, weil alle betroffenen Anbieter vertraglich im EWR
              rechnen. Beides liegt über dem, was ein modernes Rechenzentrum erreicht: Die Schätzung
              soll unseren Fußabdruck eher zu groß als zu klein ausweisen.
            </>
          )}
        </p>
      </div>
    </section>
  );
}

/* ── Belastbarkeit ────────────────────────────────────────────────────────── */

function Meter({ label, share, hint }: { label: string; share: number; hint: string }) {
  // The schema says 0..1, but this bar is a width in percent: an out-of-range
  // share would run the fill past its track and break the card silently.
  const pct = Math.min(100, Math.max(0, Math.round(share * 100)));
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className={cn('text-[0.9rem] font-bold', MONITOR_HEADING)}>{label}</span>
        <span className={cn('text-[0.9rem] font-bold tabular-nums', MONITOR_ACCENT)}>{pct} %</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded bg-[#eef2ef] dark:bg-grey-800">
        <div className="h-full rounded bg-[#52907a]" style={{ width: `${pct}%` }} />
      </div>
      <span className={cn('text-[0.78rem] leading-snug', MONITOR_FAINT)}>{hint}</span>
    </div>
  );
}

/**
 * How much of the headline number is measurement.
 *
 * `unvalued_ops` sits in this card rather than in a footnote on purpose: a page
 * that shows a CO2 figure beside an activity count implies the activity is in
 * it. For transcription, web search and speech synthesis it is not, and the
 * number saying so has to be as easy to reach as the number it qualifies.
 */
function CoveragePanel({ footprint }: { footprint: TransparencyFootprintDto }) {
  const { transcriptions, searches, speech_seconds: speechSeconds } = footprint.unvalued_ops;

  return (
    <section>
      <div className="mb-5 flex items-baseline justify-between gap-4">
        <h2 className={cn('m-0 text-[1.35rem] font-semibold tracking-[-0.01em]', MONITOR_HEADING)}>
          Wie belastbar
        </h2>
      </div>
      <div className={cn('flex flex-col gap-5 p-6', MONITOR_CARD)}>
        <Meter
          label="Gemessen"
          share={footprint.measured_share}
          hint="Vom Anbieter mitgelieferte Messwerte statt eigener Hochrechnung."
        />
        <Meter
          label="Ohne eigene Messung"
          share={footprint.bounded_share}
          hint="Für dieses Modell existiert nirgends ein Messwert. Gerechnet wird mit der Mitte zwischen zwei Modellen, die wir gemessen haben — beide Enden stehen in der Spanne oben."
        />
        <Meter
          label="Abgedeckt"
          share={footprint.covered_share}
          hint="Anteil der erzeugten Tokens, für die überhaupt ein Energiewert existiert."
        />
        {(transcriptions > 0 || searches > 0 || speechSeconds > 0) && (
          <div className="border-t border-[#eef2ef] pt-4 dark:border-grey-700/60">
            <p className={cn('m-0 mb-1 text-[0.85rem] font-bold', MONITOR_HEADING)}>
              Nicht enthalten
            </p>
            <p className={cn('m-0 text-[0.8rem] leading-relaxed', MONITOR_MUTED)}>
              {transcriptions > 0 && (
                <>
                  {formatCount(transcriptions)} Transkriptionen — kein Anbieter meldet dafür
                  Verbrauch, und wir speichern keine Audiodauer, mit der er skalieren würde.
                  {(searches > 0 || speechSeconds > 0) && ' '}
                </>
              )}
              {searches > 0 && (
                <>
                  {formatCount(searches)} Web-Recherchen — die Energie steckt im Index des
                  Suchanbieters, nicht bei uns.
                  {speechSeconds > 0 && ' '}
                </>
              )}
              {speechSeconds > 0 && (
                <>
                  {formatDuration(speechSeconds)} Sprachausgabe — KugelAudio meldet keinen
                  Verbrauch, und für Sprachsynthese gibt es keine veröffentlichte Messung, deren
                  Systemgrenze zu unserer passt. Anders als bei der Transkription erfassen wir hier
                  die Dauer, also die Größe, mit der die Energie skalieren würde; sobald eine
                  belastbare Messung existiert, lässt sich der Zeitraum rückwirkend bewerten.
                </>
              )}{' '}
              Das zählt in den Aktivitätszahlen mit, aber mit <strong>0 g</strong> im Fußabdruck —
              als Lücke ausgewiesen statt stillschweigend als Null.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

/* ── Tagesverlauf ─────────────────────────────────────────────────────────── */

/**
 * Days below `min_group_size` never reach the client, so the series has holes.
 * Rendering them as absent bars with an explicit caption is the point: an
 * unlabelled gap reads as "nobody used it", which is a different and false
 * claim about the platform.
 */
function DailyPanel({
  daily,
  minGroupSize,
  suppressedDays,
}: {
  daily: TransparencyDayEntryDto[];
  minGroupSize: number;
  suppressedDays: number;
}) {
  const max = daily.reduce((acc, d) => Math.max(acc, d.input_tokens + d.output_tokens), 0);
  if (max === 0) return null;

  return (
    <section className="mt-12">
      <div className="mb-5 flex items-baseline justify-between gap-4">
        <h2 className={cn('m-0 text-[1.35rem] font-semibold tracking-[-0.01em]', MONITOR_HEADING)}>
          Tagesverlauf
        </h2>
        <span className={cn('text-[0.85rem]', MONITOR_FAINT)}>
          Dunkel = erzeugt, hell = gesendet
        </span>
      </div>
      <div className={cn('p-6', MONITOR_CARD)}>
        <div className="flex h-44 items-end gap-[3px] overflow-x-auto">
          {daily.map((entry) => {
            const total = entry.input_tokens + entry.output_tokens;
            const heightPct = Math.max(2, Math.round((total / max) * 100));
            const outputPct = total > 0 ? Math.round((entry.output_tokens / total) * 100) : 0;
            return (
              <div
                key={entry.day}
                className="flex min-w-[6px] flex-1 flex-col justify-end self-stretch"
                title={`${formatDay(entry.day)}: ${formatCount(total)} Tokens · ${formatCount(entry.requests)} Anfragen · ${formatCount(entry.active_users)} aktive Personen`}
              >
                <div
                  className="flex w-full flex-col justify-end overflow-hidden rounded-sm bg-[#b9d0c5] dark:bg-[#2f4c3f]"
                  style={{ height: `${heightPct}%` }}
                >
                  <div className="w-full bg-[#52907a]" style={{ height: `${outputPct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
        <p className={cn('m-0 mt-4 text-[0.8rem] leading-relaxed', MONITOR_FAINT)}>
          {suppressedDays > 0 ? (
            <>
              {formatCount(suppressedDays)} {suppressedDays === 1 ? 'Tag fehlt' : 'Tage fehlen'} in
              dieser Reihe: an ihnen waren weniger als {minGroupSize} Personen aktiv, und eine
              Tageszahl aus so wenigen Personen wäre einzelnen zuzuordnen. Die Lücke ist
              Unterdrückung, keine Untätigkeit.
            </>
          ) : (
            <>
              Alle Tage im Zeitraum hatten mindestens {minGroupSize} aktive Personen und sind
              vollständig enthalten.
            </>
          )}
        </p>
      </div>
    </section>
  );
}

/* ── Aufschlüsselungen ────────────────────────────────────────────────────── */

function BreakdownRow({
  label,
  sub,
  value,
  share,
}: {
  label: string;
  sub?: string;
  value: string;
  share: number;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className={cn('text-[0.92rem] font-bold', MONITOR_HEADING)}>
          {label}
          {sub && (
            <span className={cn('ml-2 text-[0.8rem] font-normal', MONITOR_FAINT)}>{sub}</span>
          )}
        </span>
        <span className={cn('text-[0.9rem] font-bold tabular-nums', MONITOR_BODY)}>{value}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded bg-[#eef2ef] dark:bg-grey-800">
        <div className="h-full rounded bg-[#52907a]" style={{ width: `${share * 100}%` }} />
      </div>
    </div>
  );
}

function FeaturePanel({ byFeature }: { byFeature: GetTransparencyStatsResponseDto['byFeature'] }) {
  const ranked = [...byFeature].sort((a, b) => b.total_tokens - a.total_tokens);
  const max = Math.max(...ranked.map((e) => e.total_tokens), 1);
  if (ranked.length === 0) return null;

  return (
    <section className="mt-12">
      <div className="mb-5 flex items-baseline justify-between gap-4">
        <h2 className={cn('m-0 text-[1.35rem] font-semibold tracking-[-0.01em]', MONITOR_HEADING)}>
          Nach Bereich
        </h2>
        <span className={cn('text-[0.85rem]', MONITOR_FAINT)}>Sortiert nach Tokens</span>
      </div>
      <div className={cn('flex flex-col gap-4 p-6', MONITOR_CARD)}>
        {ranked.map((entry) => {
          const extras = [
            entry.images ? `${formatCount(entry.images)} Bilder` : null,
            entry.transcriptions ? `${formatCount(entry.transcriptions)} Transkriptionen` : null,
            entry.searches ? `${formatCount(entry.searches)} Recherchen` : null,
            entry.speech_seconds ? `${formatDuration(entry.speech_seconds)} Sprachausgabe` : null,
          ].filter(Boolean);
          return (
            <BreakdownRow
              key={entry.feature}
              label={FEATURE_LABELS[entry.feature] ?? entry.feature}
              sub={extras.length ? extras.join(' · ') : undefined}
              value={`${formatTokens(entry.total_tokens)} Tokens`}
              share={entry.total_tokens / max}
            />
          );
        })}
      </div>
    </section>
  );
}

/**
 * Grouped by what the model DOES.
 *
 * Voxtral transcribes and Linkup searches; in one flat list they read as chat
 * models with an odd unit, and the two lanes that carry NO footprint end up
 * looking like the ones that do. Each function gets its own scale, because a
 * bar comparing 140 images against 7 million tokens says nothing.
 */
function ModelPanel({ byModel }: { byModel: GetTransparencyStatsResponseDto['byModel'] }) {
  if (byModel.length === 0) return null;

  return (
    <section className="mt-12">
      <div className="mb-5 flex items-baseline justify-between gap-4">
        <h2 className={cn('m-0 text-[1.35rem] font-semibold tracking-[-0.01em]', MONITOR_HEADING)}>
          Nach Funktion
        </h2>
      </div>
      <div className={cn('flex flex-col gap-6 p-6', MONITOR_CARD)}>
        {FUNCTION_ORDER.map((unit) => {
          const rows = byModel.filter((e) => e.unit === unit);
          if (rows.length === 0) return null;
          const amount = (e: (typeof rows)[number]) => (unit === 'tokens' ? e.total_tokens : e.ops);
          const max = Math.max(...rows.map(amount), 1);
          return (
            <div key={unit} className="flex flex-col gap-3">
              <h3 className={cn('m-0', MONITOR_EYEBROW)}>{FUNCTION_LABELS[unit]}</h3>
              {[...rows]
                .sort((a, b) => amount(b) - amount(a))
                .map((entry) => (
                  <BreakdownRow
                    key={`${entry.provider}|${entry.model}`}
                    label={entry.model}
                    sub={providerLabel(entry.provider)}
                    value={
                      unit === 'tokens'
                        ? `${formatTokens(entry.total_tokens)} Tokens`
                        : `${formatCount(entry.ops)} ${UNIT_LABELS[unit]}`
                    }
                    share={amount(entry) / max}
                  />
                ))}
              {(unit === 'transcriptions' || unit === 'searches' || unit === 'speech_seconds') && (
                <p className={cn('m-0 text-[0.78rem]', MONITOR_FAINT)}>
                  Zählt mit, trägt aber keinen Fußabdruck — siehe „Nicht enthalten“ oben.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ── Referenz ─────────────────────────────────────────────────────────────── */

/**
 * The same work costed against GPT-4o.
 *
 * Text only on both sides: the reference has no image half at all, so comparing
 * against a total that includes Flux would invent a saving out of an accounting
 * mismatch. Energy still reports both directions, because our default model
 * needs MORE raw electricity than GPT-4o reportedly does — the CO2 advantage
 * comes from the French grid, not from sparser engineering, and collapsing that
 * into a "savings" framing would hide the one place this doesn't flatter us.
 */
function ReferencePanel({ footprint }: { footprint: TransparencyFootprintDto }) {
  // One computation for both surfaces — see referenceComparison(). Unlike the
  // personal tab, this page DOES print its own figure next to the reference:
  // the platform's consumption is exactly what it exists to publish.
  const comparison = referenceComparison(footprint);
  if (!comparison.hasComparison) return null;

  const { textEnergy, saved: co2Saved } = comparison;
  const energyFactor = textEnergy > 0 ? footprint.reference_energy_wh / textEnergy : 0;

  return (
    <section className="mt-12">
      <div className="mb-5 flex items-baseline justify-between gap-4">
        <h2 className={cn('m-0 text-[1.35rem] font-semibold tracking-[-0.01em]', MONITOR_HEADING)}>
          {co2Saved ? 'Gegenüber ChatGPT' : 'Vergleich zu ChatGPT'}
        </h2>
      </div>
      <div className={cn('flex flex-wrap gap-10 p-6', MONITOR_CARD)}>
        <div>
          <p className={cn('m-0 mb-1', MONITOR_EYEBROW)}>
            {co2Saved ? 'CO₂ gespart' : 'CO₂ mehr als bei GPT-4o'}
          </p>
          <span
            className={cn(
              'text-[2.2rem] font-semibold leading-none tracking-[-0.02em]',
              MONITOR_HEADING
            )}
          >
            ≈ {formatGrams(comparison.magnitude)}
          </span>
          <p className={cn('m-0 mt-2 text-[0.85rem]', MONITOR_MUTED)}>
            {formatCorridor(comparison.worst, comparison.best)}
          </p>
          {comparison.best - comparison.worst > 0.5 && (
            <Scale
              low={comparison.worst}
              // The signed difference, which is what the two ends bracket. The
              // headline above shows its magnitude with a word for the sign.
              mid={co2Saved ? comparison.magnitude : -comparison.magnitude}
              high={comparison.best}
              format={(v) => formatGrams(Math.abs(v))}
              lowLabel="ungünstigste Lesart"
              highLabel="günstigste"
            />
          )}
        </div>
        <div>
          <p className={cn('m-0 mb-1', MONITOR_EYEBROW)}>Energie bei ChatGPT</p>
          <span
            className={cn(
              'text-[2.2rem] font-semibold leading-none tracking-[-0.02em]',
              MONITOR_HEADING
            )}
          >
            ≈ {formatEnergy(footprint.reference_energy_wh)}
          </span>
          <p className={cn('m-0 mt-2 text-[0.85rem]', MONITOR_MUTED)}>
            unser Verbrauch: {formatEnergy(textEnergy)}
            {energyFactor > 0 && (
              <>
                {' — '}
                {/* Das Vielfache haengt IMMER an der groesseren Seite, damit
                    das „x" nie „x weniger" heissen muss: „1,5x weniger" ist
                    keine Aussage, die jemand richtig liest, und hier stand sie
                    ausgerechnet dort, wo WIR die schlechtere Seite sind. */}
                {energyFactor >= 1
                  ? `ChatGPT hätte ${oneDecimal.format(energyFactor)}× so viel gebraucht`
                  : `${oneDecimal.format(1 / energyFactor)}× so viel wie ChatGPT`}
              </>
            )}
          </p>
        </div>
        <p className={cn('m-0 max-w-[34rem] flex-1 text-[0.8rem] leading-relaxed', MONITOR_FAINT)}>
          Vergleich zu GPT-4o (Jegham et al., arXiv:2505.09598), nur Text — für Bilder gibt es keine
          vergleichbar sauber abgegrenzte OpenAI-Zahl. Der Korridor bildet zwei Dinge ab. Erstens
          ist die GPT-4o-Seite selbst geschätzt: aus API-Latenzen und GPU-Datenblättern abgeleitet,
          nicht gemessen (±30 %).
          {comparison.marketDiffers && (
            <>
              {' '}
              Zweitens gibt es zwei anerkannte Bilanzierungsmethoden. Die Zahl oben ist
              standortbasiert — sie rechnet mit dem Netz am Standort und ist unsere offizielle
              Bilanz. Das günstige Ende der Spanne ist marktbasiert und rechnet den bezogenen
              Ökostrom an: {formatGrams(comparison.textMarketEmissions)} statt{' '}
              {formatGrams(comparison.textEmissions)}. Belege dafür sind Scaleways
              Herkunftsnachweise, Hetzners EMAS-Registrierung und Seewebs zertifizierter Bezug; für
              die Bildmodelle gibt es keinen, weil wir die Region gar nicht kennen — dort fallen
              beide Methoden zusammen.{' '}
              <strong className={MONITOR_MUTED}>Die Verrechnung gilt nur für unsere Seite:</strong>{' '}
              Microsoft kauft ebenfalls Erneuerbare ein, aber deren Nachweise sind nicht unsere. Das
              günstige Ende vergleicht insofern zwei Methoden, nicht zwei Rechenzentren.
            </>
          )}
        </p>
      </div>
    </section>
  );
}

/* ── Methodik ─────────────────────────────────────────────────────────────── */

function MethodNote({ data }: { data: GetTransparencyStatsResponseDto }) {
  return (
    <p
      className={cn(
        'mt-12 rounded-2xl border border-[#e2eae5] p-6 text-[0.82rem] leading-relaxed dark:border-grey-700/60',
        MONITOR_MUTED
      )}
    >
      Erfasst werden Anfragen an KI-Modelle sowie erzeugte Bilder, Transkriptionen und
      Web-Recherchen — automatische Hintergrundprozesse zählen nicht mit. Erzeugte Tokens bestimmen
      den Verbrauch, gesendete kosten 100- bis 760-mal weniger. Kein Wert in dieser Ansicht ist
      einer einzelnen Person zuzuordnen: die Summen werden bereits in der Datenbank ohne
      Personenbezug gebildet, und Tage mit weniger als {data.min_group_size} aktiven Personen
      entfallen vollständig. Stand dieser Auswertung: {formatTimestamp(data.generated_at)} Uhr — sie
      wird alle 15 Minuten neu berechnet, ist also bewusst etwas älter als dieser Seitenaufruf.{' '}
      <a
        href={DOCS_LINK}
        target="_blank"
        rel="noreferrer"
        className={cn('no-underline hover:underline', MONITOR_ACCENT)}
      >
        Wie wir rechnen
      </a>
    </p>
  );
}

/* ── Einfache Übersicht ───────────────────────────────────────────────────── */

/**
 * The same response, told without a single technical term: one CO2 number and
 * where it came from, grouped by what people actually did — not by which
 * datacenter ran it. Tokens, PUE, grid intensity, bands and coverage shares
 * all stay in the expert view.
 *
 * The single number is the same central estimate the expert view shows, and
 * since 29.08.2026 it carries the same two scales — CO2 and electricity — in
 * plain words ("mindestens"/"höchstens") rather than none at all. Dropping the
 * vocabulary is the point of this view; dropping the uncertainty was never
 * meant to be, and the earlier copy ("die tatsächliche Zahl liegt eher
 * darunter") described a rounding direction that no longer exists.
 */
const SIMPLE_GROUPS: Record<UsageFeature, string> = {
  chat: 'Chat',
  sharepic: 'Bilder',
  docs: 'Texte & Dokumente',
  texte: 'Texte & Dokumente',
  notebook: 'Texte & Dokumente',
  sheets: 'Präsentationen & Tabellen',
  presentations: 'Präsentationen & Tabellen',
  subtitler: 'Untertitel',
  search: 'Websuche',
  boards: 'Sonstiges',
  sites: 'Sonstiges',
  monitor: 'Sonstiges',
  other: 'Sonstiges',
};

function simpleGroups(byFeature: TransparencyFeatureEntryDto[]): [string, number][] {
  const groups = new Map<string, number>();
  for (const entry of byFeature) {
    const label = SIMPLE_GROUPS[entry.feature] ?? 'Sonstiges';
    groups.set(label, (groups.get(label) ?? 0) + entry.emissions_g);
  }
  return [...groups.entries()].filter(([, grams]) => grams > 0).sort((a, b) => b[1] - a[1]);
}

function SimpleView({ data }: { data: GetTransparencyStatsResponseDto }) {
  const { footprint, totals, byFeature } = data;
  const ranked = simpleGroups(byFeature);
  const max = Math.max(...ranked.map(([, grams]) => grams), Number.EPSILON);

  return (
    <>
      <div className={cn('mb-10 p-8', MONITOR_CARD)}>
        <p className={cn('m-0 mb-1', MONITOR_EYEBROW)}>CO₂ der letzten {data.days} Tage</p>
        <div className="flex flex-wrap items-baseline gap-3.5">
          <span
            className={cn(
              'text-[3.4rem] font-semibold leading-none tracking-[-0.03em]',
              MONITOR_HEADING
            )}
          >
            ≈ {formatGrams(footprint.emissions_g)}
          </span>
          <span className={cn('text-[1.1rem] font-bold', MONITOR_ACCENT)}>CO₂</span>
        </div>
        {hasSpan(footprint.emissions_g_low, footprint.emissions_g_high) && (
          <Scale
            low={footprint.emissions_g_low}
            mid={footprint.emissions_g}
            high={footprint.emissions_g_high}
            format={formatGrams}
          />
        )}
        <p className={cn('m-0 mt-4 max-w-[38rem] text-[0.9rem] leading-relaxed', MONITOR_MUTED)}>
          Das entspricht ungefähr {carComparison(footprint.emissions_g)}. Ein Teil davon ist
          gemessen, ein Teil geschätzt — der Balken zeigt, wie weit die Schätzung reicht. Die
          angezeigte Zahl liegt in der Mitte, nicht am günstigen Rand.
        </p>
        <div className="mt-6 border-t border-[#eef2ef] pt-5 dark:border-grey-700/60">
          <p className={cn('m-0 mb-1', MONITOR_EYEBROW)}>Verbrauchter Strom</p>
          <span className={cn('text-[1.6rem] font-semibold leading-none', MONITOR_HEADING)}>
            ≈ {formatEnergy(footprint.energy_wh)}
          </span>
          {hasSpan(footprint.energy_wh_low, footprint.energy_wh_high) && (
            <Scale
              low={footprint.energy_wh_low}
              mid={footprint.energy_wh}
              high={footprint.energy_wh_high}
              format={formatEnergy}
            />
          )}
        </div>
      </div>

      {ranked.length > 0 && (
        <section>
          <div className="mb-5 flex items-baseline justify-between gap-4">
            <h2
              className={cn('m-0 text-[1.35rem] font-semibold tracking-[-0.01em]', MONITOR_HEADING)}
            >
              Wobei es entstanden ist
            </h2>
          </div>
          <div className={cn('flex flex-col gap-4 p-6', MONITOR_CARD)}>
            {ranked.map(([label, grams]) => (
              <BreakdownRow
                key={label}
                label={label}
                sub={carComparison(grams)}
                value={formatGrams(grams)}
                share={grams / max}
              />
            ))}
            {(totals.searches > 0 || totals.transcriptions > 0 || totals.speech_seconds > 0) && (
              <p
                className={cn(
                  'm-0 mt-1 border-t border-[#eef2ef] pt-4 text-[0.8rem] leading-relaxed dark:border-grey-700/60',
                  MONITOR_FAINT
                )}
              >
                Dazu kommen{' '}
                {totals.searches > 0 && (
                  <>
                    {formatCount(totals.searches)} Websuchen — der Strom dafür fällt beim
                    Suchanbieter an, nicht bei uns
                  </>
                )}
                {totals.searches > 0 && totals.transcriptions > 0 && <> — und </>}
                {totals.transcriptions > 0 && (
                  <>
                    {formatCount(totals.transcriptions)} untertitelte Videos und Transkripte, für
                    die uns kein Anbieter einen Verbrauch meldet
                  </>
                )}
                {totals.speech_seconds > 0 &&
                  (totals.transcriptions > 0 || totals.searches > 0) && <> — und </>}
                {totals.speech_seconds > 0 && (
                  <>
                    {formatDuration(totals.speech_seconds)} vorgelesene Sprachausgabe, für die es
                    keine Messung mit passender Systemgrenze gibt
                  </>
                )}
                . Das können wir deshalb nicht seriös mitzählen; es fehlt in der Zahl oben und wir
                sagen das lieber dazu.
              </p>
            )}
          </div>
        </section>
      )}

      <p
        className={cn(
          'mt-12 rounded-2xl border border-[#e2eae5] p-6 text-[0.82rem] leading-relaxed dark:border-grey-700/60',
          MONITOR_MUTED
        )}
      >
        Kein Wert auf dieser Seite ist einer einzelnen Person zuzuordnen — gezählt wird nur, was
        alle zusammen verbraucht haben. Wer die Rechnung dahinter sehen will — welche Rechenzentren,
        welche Modelle, mit welchen Annahmen — findet sie in der Expert*innenübersicht.{' '}
        <a
          href={DOCS_LINK}
          target="_blank"
          rel="noreferrer"
          className={cn('no-underline hover:underline', MONITOR_ACCENT)}
        >
          Wie wir rechnen
        </a>
      </p>
    </>
  );
}

/* ── Ansicht ──────────────────────────────────────────────────────────────── */

function ExpertView({ data }: { data: GetTransparencyStatsResponseDto }) {
  const { footprint, totals, daily, byFeature, byModel, providers } = data;

  return (
    <>
      <FootprintHero footprint={footprint} daily={daily} days={data.days} />

      <div className={cn('mb-10 flex flex-wrap gap-x-8 gap-y-2 text-[0.9rem]', MONITOR_BODY)}>
        <span>
          <strong className="tabular-nums">{formatCount(totals.requests)}</strong> KI-Anfragen
        </span>
        <span>
          <strong className="tabular-nums">{formatTokens(totals.total_tokens)}</strong> Tokens
        </span>
        <span>
          <strong className="tabular-nums">{formatCount(totals.images)}</strong> Bilder
        </span>
        <span>
          <strong className="tabular-nums">{formatCount(totals.transcriptions)}</strong>{' '}
          Transkriptionen
        </span>
        <span>
          <strong className="tabular-nums">{formatCount(totals.searches)}</strong> Recherchen
        </span>
        <span>
          <strong className="tabular-nums">{formatDuration(totals.speech_seconds)}</strong>{' '}
          Sprachausgabe
        </span>
      </div>

      <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1.45fr_1fr]">
        <ProviderPanel providers={providers} />
        <CoveragePanel footprint={footprint} />
      </div>

      <DailyPanel
        daily={daily}
        minGroupSize={data.min_group_size}
        suppressedDays={data.suppressed_days}
      />
      <ReferencePanel footprint={footprint} />

      <div className="grid grid-cols-1 gap-x-12 lg:grid-cols-2">
        <FeaturePanel byFeature={byFeature} />
        <ModelPanel byModel={byModel} />
      </div>

      <MethodNote data={data} />
    </>
  );
}

export function TransparenzView({
  days,
  expert,
  locale,
}: {
  days: number;
  expert: boolean;
  locale: TransparencyLocale | null;
}) {
  const { data, isLoading, isError } = useTransparencyStats(days, locale);

  if (isLoading) return <LoadingSection label="Verbrauchsdaten werden geladen..." />;

  if (isError || !data) {
    return (
      <StatusBanner variant="error">
        Die Transparenzdaten konnten nicht geladen werden. Bitte versuche es später erneut.
      </StatusBanner>
    );
  }

  // Not an error and not an empty state: the platform HAS data, it is just too
  // thin to publish without pointing at individuals. Saying that is the honest
  // rendering — "keine Daten" would be a false statement about the platform.
  if (!data.sufficient_data) {
    return (
      <div className={cn('p-8', MONITOR_CARD)}>
        <p className={cn('m-0 text-[1.05rem] font-bold', MONITOR_HEADING)}>
          Zu wenige Personen für eine veröffentlichbare Zahl
        </p>
        <p className={cn('m-0 mt-2 text-[0.9rem] leading-relaxed', MONITOR_MUTED)}>
          In den letzten {data.days} Tagen waren
          {locale ? ` aus ${LOCALE_LABELS[locale]}` : ''} weniger als {data.min_group_size} Personen
          aktiv. Ein Verbrauchswert aus so wenigen Personen beschreibt keine Plattform, sondern
          einzelne Nachmittage — deshalb zeigen wir hier nichts. Mit einem größeren Zeitraum kann
          die Auswertung greifen.
        </p>
      </div>
    );
  }

  return expert ? <ExpertView data={data} /> : <SimpleView data={data} />;
}
