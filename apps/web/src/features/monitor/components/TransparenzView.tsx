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
  type TransparencyFootprintDto,
  type TransparencyProviderEntryDto,
} from '@gruenerator/contracts';
import { cn, LoadingSection, StatusBanner } from '@gruenerator/ui';
import { useSearchParams } from 'react-router-dom';

import { getDocsUrl } from '../../../utils/docsUrl';
import {
  carComparison,
  FEATURE_LABELS,
  formatCount,
  formatDay,
  formatEnergy,
  formatGrams,
  formatTokens,
  oneDecimal,
  REFERENCE_UNCERTAINTY,
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

/** Human names for the upstreams the tracker records. */
const PROVIDER_LABELS: Record<string, string> = {
  mistral: 'Mistral AI',
  scaleway: 'Scaleway',
  litellm: 'verdigado (selbst gehostet)',
  regolo: 'Regolo / Seeweb',
  greenpt: 'GreenPT',
  bfl: 'Black Forest Labs',
};

const DOCS_LINK = `${getDocsUrl()}/docs/ueber-den-gruenerator/nachhaltigkeit`;

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
 * The headline figure, as a range.
 *
 * The upper end is what a single-number reading falls back to, deliberately:
 * of the two ends, it is the one that cannot flatter us.
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
  const isBand = footprint.emissions_g - footprint.emissions_g_low > 0.5;

  return (
    <div
      className={cn('mb-10 flex flex-wrap items-center justify-between gap-8 p-8', MONITOR_CARD)}
    >
      <div>
        <p className={cn('m-0 mb-1', MONITOR_EYEBROW)}>CO₂ der letzten {days} Tage</p>
        <div className="flex flex-wrap items-baseline gap-3.5">
          <span
            className={cn(
              'text-[3.4rem] font-semibold leading-none tracking-[-0.03em]',
              MONITOR_HEADING
            )}
          >
            {isBand
              ? `${formatGrams(footprint.emissions_g_low)} – ${formatGrams(footprint.emissions_g)}`
              : `≈ ${formatGrams(footprint.emissions_g)}`}
          </span>
          <span className={cn('text-[1.1rem] font-bold', MONITOR_ACCENT)}>CO₂e</span>
        </div>
        <p className={cn('m-0 mt-2.5 text-[0.9rem]', MONITOR_MUTED)}>
          {isBand
            ? `${formatEnergy(footprint.energy_wh_low)} – ${formatEnergy(footprint.energy_wh)} Strom`
            : `${formatEnergy(footprint.energy_wh)} Strom`}{' '}
          · so viel wie {carComparison(footprint.emissions_g)}
          {footprint.image_emissions_g > 0 && (
            <> · davon {formatGrams(footprint.image_emissions_g)} aus erzeugten Bildern</>
          )}
        </p>
      </div>
      <HeroSparkline points={daily} />
    </div>
  );
}

/* ── Anbieter ─────────────────────────────────────────────────────────────── */

/**
 * Where the energy went, and with which constants it was costed.
 *
 * This is the part that makes the headline number checkable: grid intensity and
 * PUE are the only two inputs besides kWh, and both are printed next to the
 * share they were applied to.
 */
function ProviderPanel({ providers }: { providers: TransparencyProviderEntryDto[] }) {
  const ranked = [...providers].sort((a, b) => b.energy_wh - a.energy_wh);
  const max = Math.max(...ranked.map((p) => p.energy_wh), 1);

  return (
    <section>
      <div className="mb-5 flex items-baseline justify-between gap-4">
        <h2 className={cn('m-0 text-[1.35rem] font-semibold tracking-[-0.01em]', MONITOR_HEADING)}>
          Nach Anbieter
        </h2>
        <span className={cn('text-[0.85rem]', MONITOR_FAINT)}>Sortiert nach Energie</span>
      </div>
      <div className={cn('flex flex-col gap-4 p-6', MONITOR_CARD)}>
        {ranked.map((entry) => (
          <div key={entry.provider} className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className={cn('text-[0.95rem] font-bold', MONITOR_HEADING)}>
                {PROVIDER_LABELS[entry.provider] ?? entry.provider}
              </span>
              <span className={cn('text-[0.95rem] font-bold tabular-nums', MONITOR_ACCENT)}>
                {formatEnergy(entry.energy_wh)} · {formatGrams(entry.emissions_g)}
              </span>
            </div>
            <div className="h-[18px] overflow-hidden rounded-md bg-[#eef2ef] dark:bg-grey-800">
              <div
                className="h-full rounded-md bg-[#52907a] transition-[width] duration-500"
                style={{ width: `${(entry.energy_wh / max) * 100}%` }}
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <span className={MONITOR_TAG}>
                Netz {oneDecimal.format(entry.grid_g_per_kwh)} g/kWh
              </span>
              <span className={MONITOR_TAG}>PUE {oneDecimal.format(entry.pue)}</span>
            </div>
          </div>
        ))}
        <p className={cn('m-0 mt-1 text-[0.8rem] leading-relaxed', MONITOR_FAINT)}>
          Emissionen = Energie × Netzintensität, standortbasiert. Die Netzintensität ist der
          Jahresdurchschnitt des Landes, in dem der Anbieter rechnet — kein Zertifikatehandel. PUE
          ist der Aufschlag des Rechenzentrums für Kühlung und Verluste; er steckt bereits in der
          gezeigten Energie.
        </p>
      </div>
    </section>
  );
}

/* ── Belastbarkeit ────────────────────────────────────────────────────────── */

function Meter({ label, share, hint }: { label: string; share: number; hint: string }) {
  const pct = Math.round(share * 100);
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
 * it. For transcription and web search it is not, and the number saying so has
 * to be as easy to reach as the number it qualifies.
 */
function CoveragePanel({ footprint }: { footprint: TransparencyFootprintDto }) {
  const { transcriptions, searches } = footprint.unvalued_ops;

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
          label="Obergrenze"
          share={footprint.bounded_share}
          hint="Kein messbares Gegenstück vorhanden — bewusst mit dem oberen Ende der gemessenen Spanne gerechnet."
        />
        <Meter
          label="Abgedeckt"
          share={footprint.covered_share}
          hint="Anteil der erzeugten Tokens, für die überhaupt ein Energiewert existiert."
        />
        {(transcriptions > 0 || searches > 0) && (
          <div className="border-t border-[#eef2ef] pt-4 dark:border-grey-700/60">
            <p className={cn('m-0 mb-1 text-[0.85rem] font-bold', MONITOR_HEADING)}>
              Nicht enthalten
            </p>
            <p className={cn('m-0 text-[0.8rem] leading-relaxed', MONITOR_MUTED)}>
              {transcriptions > 0 && (
                <>
                  {formatCount(transcriptions)} Transkriptionen — kein Anbieter meldet dafür
                  Verbrauch, und wir speichern keine Audiodauer, mit der er skalieren würde.
                  {searches > 0 && ' '}
                </>
              )}
              {searches > 0 && (
                <>
                  {formatCount(searches)} Web-Recherchen — die Energie steckt im Index des
                  Suchanbieters, nicht bei uns.
                </>
              )}{' '}
              Beides zählt in den Aktivitätszahlen mit, aber mit <strong>0 g</strong> im Fußabdruck
              — als Lücke ausgewiesen statt stillschweigend als Null.
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

function ModelPanel({ byModel }: { byModel: GetTransparencyStatsResponseDto['byModel'] }) {
  const tokenModels = byModel.filter((e) => e.unit === 'tokens');
  const otherModels = byModel.filter((e) => e.unit !== 'tokens');
  const max = Math.max(...tokenModels.map((e) => e.total_tokens), 1);
  if (byModel.length === 0) return null;

  return (
    <section className="mt-12">
      <div className="mb-5 flex items-baseline justify-between gap-4">
        <h2 className={cn('m-0 text-[1.35rem] font-semibold tracking-[-0.01em]', MONITOR_HEADING)}>
          Nach Modell
        </h2>
        <span className={cn('text-[0.85rem]', MONITOR_FAINT)}>Sortiert nach Tokens</span>
      </div>
      <div className={cn('flex flex-col gap-4 p-6', MONITOR_CARD)}>
        {[...tokenModels]
          .sort((a, b) => b.total_tokens - a.total_tokens)
          .map((entry) => (
            <BreakdownRow
              key={`${entry.provider}|${entry.model}`}
              label={entry.model}
              sub={PROVIDER_LABELS[entry.provider] ?? entry.provider}
              value={`${formatTokens(entry.total_tokens)} Tokens`}
              share={entry.total_tokens / max}
            />
          ))}
        {otherModels.length > 0 && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-[#eef2ef] pt-4 dark:border-grey-700/60">
            {[...otherModels]
              .sort((a, b) => b.ops - a.ops)
              .map((entry) => (
                <span
                  key={`${entry.provider}|${entry.model}|${entry.unit}`}
                  className={cn('text-[0.82rem]', MONITOR_MUTED)}
                >
                  {entry.model}{' '}
                  <span className="font-bold tabular-nums">
                    {formatCount(entry.ops)} {UNIT_LABELS[entry.unit] ?? entry.unit}
                  </span>
                </span>
              ))}
          </div>
        )}
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
  const textEmissions = footprint.emissions_g - footprint.image_emissions_g;
  const textEnergy = footprint.energy_wh - footprint.image_energy_wh;
  const savings = footprint.reference_emissions_g - textEmissions;
  if (savings <= 0) return null;

  const energyFactor = textEnergy > 0 ? footprint.reference_energy_wh / textEnergy : 0;
  const savingsLow = Math.max(
    footprint.reference_emissions_g * (1 - REFERENCE_UNCERTAINTY) - textEmissions,
    0
  );
  const savingsHigh = footprint.reference_emissions_g * (1 + REFERENCE_UNCERTAINTY) - textEmissions;

  return (
    <section className="mt-12">
      <div className="mb-5 flex items-baseline justify-between gap-4">
        <h2 className={cn('m-0 text-[1.35rem] font-semibold tracking-[-0.01em]', MONITOR_HEADING)}>
          Gegenüber ChatGPT
        </h2>
      </div>
      <div className={cn('flex flex-wrap gap-10 p-6', MONITOR_CARD)}>
        <div>
          <p className={cn('m-0 mb-1', MONITOR_EYEBROW)}>CO₂ gespart</p>
          <span
            className={cn(
              'text-[2.2rem] font-semibold leading-none tracking-[-0.02em]',
              MONITOR_HEADING
            )}
          >
            ≈ {formatGrams(savings)}
          </span>
          <p className={cn('m-0 mt-2 text-[0.85rem]', MONITOR_MUTED)}>
            etwa {formatGrams(savingsLow)} – {formatGrams(savingsHigh)}
          </p>
        </div>
        <div>
          <p className={cn('m-0 mb-1', MONITOR_EYEBROW)}>Energie</p>
          <span
            className={cn(
              'text-[2.2rem] font-semibold leading-none tracking-[-0.02em]',
              MONITOR_HEADING
            )}
          >
            ≈ {formatEnergy(footprint.reference_energy_wh)}
          </span>
          <p className={cn('m-0 mt-2 text-[0.85rem]', MONITOR_MUTED)}>
            statt {formatEnergy(textEnergy)} —{' '}
            {energyFactor >= 1
              ? `${oneDecimal.format(energyFactor)}× so viel`
              : `${oneDecimal.format(1 / energyFactor)}× weniger als bei uns`}
          </p>
        </div>
        <p className={cn('m-0 max-w-[34rem] flex-1 text-[0.8rem] leading-relaxed', MONITOR_FAINT)}>
          Vergleich zu GPT-4o (Jegham et al., arXiv:2505.09598), nur Text — für Bilder gibt es keine
          vergleichbar sauber abgegrenzte OpenAI-Zahl. Der Korridor bildet ab, dass die GPT-4o-Seite
          selbst geschätzt ist: aus API-Latenzen und GPU-Datenblättern abgeleitet, nicht gemessen.
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

/* ── Ansicht ──────────────────────────────────────────────────────────────── */

export function TransparenzView({ days }: { days: number }) {
  const { data, isLoading, isError } = useTransparencyStats(days);

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
          In den letzten {data.days} Tagen waren weniger als {data.min_group_size} Personen aktiv.
          Ein Verbrauchswert aus so wenigen Personen beschreibt keine Plattform, sondern einzelne
          Nachmittage — deshalb zeigen wir hier nichts. Mit einem größeren Zeitraum kann die
          Auswertung greifen.
        </p>
      </div>
    );
  }

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
