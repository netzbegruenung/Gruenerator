/**
 * "Rechenweg" — every figure, factor and assumption behind the Nachhaltigkeit
 * page, so the arithmetic can be checked from outside. A footprint nobody can
 * recompute is an assertion, not transparency.
 *
 * Purely presentational: the data, filters and the thin-data refusal are
 * handled by `TransparenzView`.
 */
import {
  type GetTransparencyStatsResponseDto,
  type TransparencyFeature,
} from '@gruenerator/contracts';
import { cn } from '@gruenerator/ui';
import { type ReactNode } from 'react';

import {
  FEATURE_LABELS,
  formatCount,
  formatDuration,
  formatEnergy,
  formatGrams,
  formatTokens,
  FUNCTION_LABELS,
  oneDecimal,
  providerLabel,
  UNIT_LABELS,
} from '../../../../utils/usageFormat';

const CARD = 'rounded-2xl border border-[var(--nh-line)] bg-[var(--nh-card)] p-5 sm:p-7';
const H2 = 'nh-display m-0 text-[22px] font-bold sm:text-[26px]';
const MUTED = 'text-[var(--nh-muted)]';
const CODE =
  'm-0 overflow-x-auto whitespace-pre rounded-lg bg-[var(--nh-code)] p-3 font-mono text-[13px] leading-relaxed';
const TAG = 'rounded-full bg-[var(--nh-mist)] px-2.5 py-[3px] text-[13px]';

const SECTIONS = [
  ['r-summe', 'Überblick'],
  ['r-formel', 'Formel'],
  ['r-faktoren', 'Faktoren'],
  ['r-anbieter', 'Anbieter'],
  ['r-modelle', 'Modelle'],
  ['r-bereiche', 'Bereiche'],
  ['r-ohne', 'Ohne Fußabdruck'],
  ['r-belastbarkeit', 'Belastbarkeit'],
] as const;

type SectionId = (typeof SECTIONS)[number][0];

function Section({
  id,
  title,
  aside,
  children,
}: {
  id: SectionId;
  title: string;
  aside?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className={cn(CARD, 'scroll-mt-6')}>
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={`${id}-h`} className={H2}>
          {title}
        </h2>
        {aside && <span className={cn('text-[13px]', MUTED)}>{aside}</span>}
      </div>
      {children}
    </section>
  );
}

/** Label, value and a bar scaled to the largest row of the list. */
function BarRow({
  label,
  sub,
  value,
  share,
  meta,
}: {
  label: string;
  sub?: string;
  value: string;
  share: number;
  meta?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="min-w-0 break-words text-[15px] font-bold">
          {label}
          {sub && <span className={cn('ml-2 text-[13px] font-normal', MUTED)}>{sub}</span>}
        </span>
        <span className="text-[14px] font-bold tabular-nums">{value}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--nh-mist)]">
        <div
          className="h-full rounded-full bg-[var(--nh-accent)]"
          style={{ width: `${Math.max(0.6, Math.min(1, share) * 100)}%` }}
        />
      </div>
      {meta}
    </div>
  );
}

function Summary({ data }: { data: GetTransparencyStatsResponseDto }) {
  const { footprint, totals } = data;
  const stats: [string, string][] = [
    [formatCount(totals.requests), 'KI-Anfragen'],
    [formatTokens(totals.input_tokens), 'Eingabe-Tokens'],
    [formatTokens(totals.output_tokens), 'Ausgabe-Tokens'],
    [formatCount(totals.images), 'Bilder'],
    [formatCount(totals.transcriptions), 'Transkriptionen'],
    [formatCount(totals.searches), 'Recherchen'],
    [formatDuration(totals.speech_seconds), 'Sprachausgabe'],
  ];

  return (
    <section
      id="r-summe"
      aria-label="Überblick"
      className="grid scroll-mt-6 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1.2fr]"
    >
      <div className="rounded-2xl bg-[var(--nh-deep)] p-6 text-white sm:p-7">
        <p className="m-0 text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--nh-glow)]">
          CO₂e · {data.days} Tage
        </p>
        <p className="nh-display m-0 mt-2 text-[clamp(40px,5vw,56px)] font-black leading-none">
          {formatGrams(footprint.emissions_g)}
        </p>
        <p className="m-0 mt-3 text-[14px] text-[var(--nh-glow-soft)]">
          Spanne {formatGrams(footprint.emissions_g_low)} bis{' '}
          {formatGrams(footprint.emissions_g_high)}
          {footprint.image_emissions_g > 0 &&
            ` · davon ${formatGrams(footprint.image_emissions_g)} aus Bildern`}
        </p>
      </div>
      <div className={CARD}>
        <p className={cn('m-0 text-[12px] font-bold uppercase tracking-[0.14em]', MUTED)}>Strom</p>
        <p className="nh-display m-0 mt-2 text-[clamp(40px,5vw,56px)] font-black leading-none">
          {formatEnergy(footprint.energy_wh)}
        </p>
        <p className={cn('m-0 mt-3 text-[14px]', MUTED)}>
          Spanne {formatEnergy(footprint.energy_wh_low)} bis{' '}
          {formatEnergy(footprint.energy_wh_high)}
        </p>
      </div>
      <dl
        className={cn(
          CARD,
          'm-0 grid grid-cols-2 gap-x-6 gap-y-4 md:col-span-2 xl:col-span-1 xl:grid-cols-2'
        )}
      >
        {stats.map(([value, label]) => (
          <div key={label} className="flex flex-col-reverse">
            <dt className={cn('text-[13px]', MUTED)}>{label}</dt>
            <dd className="m-0 text-[20px] font-bold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Formula({ data }: { data: GetTransparencyStatsResponseDto }) {
  const pue = oneDecimal.format(data.calculation.estimated_text.calibration_pue);
  const steps: [string, string][] = [
    ['Gemeldete Werte', 'provider_kWh × 1.000 = Wh\nprovider_g_CO2e → direkt übernommen'],
    [
      'Geschätzter Strom',
      `( Eingabe-Tokens × mWh/Token\n+ Ausgabe-Tokens × mWh/Token\n+ Anfragen × mWh/Anfrage )\n× Anbieter-PUE ÷ Kalibrierungs-PUE (${pue})`,
    ],
    ['Strom zu CO₂', 'Strom (kWh) × Netzintensität (g/kWh)\n= g CO₂e'],
  ];
  const melious = data.providers.some((p) => p.provider === 'melious');

  return (
    <Section id="r-formel" title="Formel">
      <ol className="m-0 grid list-none grid-cols-1 gap-5 p-0 lg:grid-cols-3">
        {steps.map(([title, code], i) => (
          <li key={title} className="flex min-w-0 flex-col gap-2.5">
            <span className="flex items-center gap-2.5 text-[15px] font-bold">
              <span className="grid size-7 place-items-center rounded-full bg-[var(--nh-deep)] text-[13px] text-white">
                {i + 1}
              </span>
              {title}
            </span>
            <pre className={CODE}>{code}</pre>
          </li>
        ))}
      </ol>
      {melious && (
        <div className="mt-6 grid grid-cols-1 gap-5 rounded-xl border border-[var(--nh-line)] p-5 lg:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-2.5">
            <span className="text-[15px] font-bold">So schätzt unser Hauptanbieter melious</span>
            <pre className={CODE}>
              {
                'Strom = GPU-Nennleistung (kW) × Dauer der Anfrage (h) × PUE\nCO₂   = Strom × Netzintensität (stündlicher Landesdurchschnitt)'
              }
            </pre>
          </div>
          <ul
            className={cn('m-0 flex list-none flex-col gap-2 p-0 text-[14px] leading-snug', MUTED)}
          >
            <li>
              <b className="text-[var(--nh-ink)]">Kein Zählerwert.</b> Jede Anfrage wird nach
              derselben Formel geschätzt.
            </li>
            <li>
              <b className="text-[var(--nh-ink)]">Eher zu hoch bei ausgelasteten GPUs:</b> Die
              Formel rechnet jeder Anfrage eine ganze GPU zu, obwohl sich viele Anfragen eine
              teilen.
            </li>
            <li>
              <b className="text-[var(--nh-ink)]">Eher zu niedrig bei wenig Last:</b> Leerlaufstrom
              wird keiner Anfrage zugerechnet. Über den Tag gleicht sich das teilweise aus.
            </li>
          </ul>
        </div>
      )}
    </Section>
  );
}

function Factors({ data }: { data: GetTransparencyStatsResponseDto }) {
  const { profiles } = data.calculation.estimated_text;
  return (
    <Section
      id="r-faktoren"
      title="Faktoren"
      aside="aus dem laufenden Berechnungsprofil · ohne Modellnamen"
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-left text-[14px]">
          <thead className={cn('text-[12px] uppercase tracking-[0.08em]', MUTED)}>
            <tr className="border-b border-[var(--nh-line)]">
              <th className="py-2 pr-4 font-semibold">Grundlage</th>
              <th className="py-2 pr-4 text-right font-semibold">Eingabe mWh/Token</th>
              <th className="py-2 pr-4 text-right font-semibold">Ausgabe mWh/Token</th>
              <th className="py-2 text-right font-semibold">Grundwert mWh/Anfrage</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {profiles.map((p) => (
              <tr
                key={`${p.basis}-${p.input_mwh_per_token}-${p.output_mwh_per_token}-${p.fixed_mwh_per_request}`}
                className="border-b border-[var(--nh-line)] last:border-0"
              >
                <td className="py-2 pr-4">
                  <span
                    className={cn(
                      'rounded-full px-2.5 py-0.5 text-[12px] font-bold',
                      p.basis === 'calibrated'
                        ? 'bg-[var(--nh-chip)] text-[var(--nh-chip-ink)]'
                        : 'bg-[var(--nh-warn)] text-[var(--nh-warn-ink)]'
                    )}
                  >
                    {p.basis === 'calibrated' ? 'kalibriert' : 'Bandbreite'}
                  </span>
                </td>
                <td className="py-2 pr-4 text-right">{p.input_mwh_per_token}</td>
                <td className="py-2 pr-4 text-right">{p.output_mwh_per_token}</td>
                <td className="py-2 text-right">{p.fixed_mwh_per_request}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={cn('m-0 mt-4 text-[13px]', MUTED)}>
        Kalibriert: feste Werte pro Token, an genau diesem Modell gemessen. Bandbreite: Schätzung
        zwischen zwei gemessenen Modellen, fließt in die Spanne ein.
      </p>
    </Section>
  );
}

/**
 * Sorted by CO2, not by energy: grid factors span a factor of 16, so the
 * biggest consumer of kWh is not the biggest emitter.
 */
function Providers({ data }: { data: GetTransparencyStatsResponseDto }) {
  const ranked = [...data.providers].sort((a, b) => b.emissions_g - a.emissions_g);
  const max = Math.max(...ranked.map((p) => p.emissions_g), 1);
  const estimatedPue = ranked.some((p) => p.pue_estimated);

  return (
    <Section id="r-anbieter" title="Anbieter" aside="nach CO₂">
      <div className="flex flex-col gap-5">
        {ranked.map((p) => (
          <BarRow
            key={p.provider}
            label={providerLabel(p.provider)}
            value={`${formatGrams(p.emissions_g)} · ${formatEnergy(p.energy_wh)}`}
            share={p.emissions_g / max}
            meta={
              <div className="flex flex-wrap gap-1.5">
                <span className={TAG}>Netz {oneDecimal.format(p.grid_g_per_kwh)} g/kWh</span>
                <span className={TAG}>
                  PUE {p.pue_estimated ? '≈' : ''}
                  {oneDecimal.format(p.pue)}
                </span>
              </div>
            }
          />
        ))}
      </div>
      <p className={cn('m-0 mt-5 text-[13px] leading-relaxed', MUTED)}>
        Netz: Jahresdurchschnitt des Landes, in dem gerechnet wird (standortbasiert). PUE: Aufschlag
        des Rechenzentrums für Kühlung und Verluste, steckt schon im Strom.
        {estimatedPue &&
          ' Mit ≈ markierte PUE veröffentlicht der Betreiber nicht. Wir schätzen sie über den Standort: in Deutschland mit der Obergrenze des Energieeffizienzgesetzes (1,5), sonst mit dem europäischen Durchschnitt (1,5).'}
      </p>
    </Section>
  );
}

function TextModels({ data }: { data: GetTransparencyStatsResponseDto }) {
  const rows = data.byModel
    .filter((m) => m.unit === 'tokens')
    .map((m) => ({ ...m, tokens: m.input_tokens + m.output_tokens }))
    .sort((a, b) => b.tokens - a.tokens);
  const max = Math.max(...rows.map((r) => r.tokens), 1);

  return (
    <Section id="r-modelle" title="Textmodelle" aside="nach Tokens">
      <div className="flex flex-col gap-4">
        {rows.map((m) => (
          <BarRow
            key={`${m.provider}|${m.model}`}
            label={m.model}
            sub={providerLabel(m.provider)}
            value={formatTokens(m.tokens)}
            share={m.tokens / max}
          />
        ))}
      </div>
    </Section>
  );
}

function Areas({ data }: { data: GetTransparencyStatsResponseDto }) {
  const rows = [...data.byFeature]
    .map((e) => ({ ...e, tokens: e.input_tokens + e.output_tokens }))
    .sort((a, b) => b.tokens - a.tokens);
  const max = Math.max(...rows.map((r) => r.tokens), 1);

  return (
    <Section id="r-bereiche" title="Bereiche" aside="nach Tokens">
      {rows.length === 0 ? (
        <p className={cn('m-0 text-[14px] leading-relaxed', MUTED)}>
          Die kleinen Bereiche wären zusammen weniger als {data.min_group_size} Personen und ließen
          sich aus der Differenz zur Gesamtzahl ablesen. Deshalb gibt es keine Aufschlüsselung.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {rows.map((e) => {
            const extras = [
              e.images ? `${formatCount(e.images)} Bilder` : null,
              e.transcriptions ? `${formatCount(e.transcriptions)} Transkriptionen` : null,
              e.searches ? `${formatCount(e.searches)} Recherchen` : null,
              e.speech_seconds ? `${formatDuration(e.speech_seconds)} Sprachausgabe` : null,
            ].filter(Boolean);
            return (
              <BarRow
                key={e.feature}
                label={
                  e.feature === 'other' ? 'Sonstiges & kleine Bereiche' : FEATURE_LABELS[e.feature]
                }
                value={`${formatTokens(e.tokens)} Tokens`}
                share={e.tokens / max}
                meta={
                  extras.length > 0 && (
                    <span className={cn('text-[12px]', MUTED)}>{extras.join(' · ')}</span>
                  )
                }
              />
            );
          })}
        </div>
      )}
      <p className={cn('m-0 mt-5 text-[13px] leading-relaxed', MUTED)}>
        Ein Bereich zählt an einem Tag nur einzeln, wenn ihn mindestens {data.min_group_size}{' '}
        Personen genutzt haben. Alles andere steht unter „Sonstiges & kleine Bereiche“.
      </p>
    </Section>
  );
}

/** Counted, but with 0 g in the footprint — shown as a gap, not as a zero. */
function Unvalued({ data }: { data: GetTransparencyStatsResponseDto }) {
  const rows = data.byModel
    .filter((m) => m.unit !== 'tokens' && m.unit !== 'images' && m.ops > 0)
    .sort((a, b) => b.ops - a.ops);

  return (
    <Section id="r-ohne" title="Ohne Fußabdruck">
      <p className={cn('m-0 mb-4 text-[14px]', MUTED)}>
        Gezählt, aber nicht eingerechnet, weil die Anbieter keine Energiedaten liefern.
      </p>
      {rows.length === 0 ? (
        <p className={cn('m-0 text-[14px]', MUTED)}>In diesem Zeitraum nichts.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {rows.map((m) => (
            <li
              key={`${m.provider}|${m.model}|${m.unit}`}
              className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-[var(--nh-line)] py-2.5 last:border-0"
            >
              <span className="min-w-0">
                <b className="break-words text-[14px]">{m.model}</b>{' '}
                <span className={cn('text-[13px]', MUTED)}>{providerLabel(m.provider)}</span>
                <span className={cn('block text-[12px]', MUTED)}>{FUNCTION_LABELS[m.unit]}</span>
              </span>
              <span className="text-[14px] tabular-nums">
                {m.unit === 'speech_seconds'
                  ? formatDuration(m.ops)
                  : `${formatCount(m.ops)} ${UNIT_LABELS[m.unit]}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function Reliability({ data }: { data: GetTransparencyStatsResponseDto }) {
  const { footprint } = data;
  const pct = (share: number) => Math.round(Math.min(1, Math.max(0, share)) * 100);
  const parts = [
    { label: 'vom Anbieter gemeldet', share: footprint.measured_share, color: 'var(--nh-deep)' },
    { label: 'kalibriert', share: footprint.calibrated_share, color: '#52907a' },
    { label: 'Bandbreite', share: footprint.bounded_share, color: 'var(--nh-glow-soft)' },
  ];

  return (
    <Section id="r-belastbarkeit" title="Belastbarkeit">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-4">
          <p className={cn('m-0 text-[14px] leading-relaxed', MUTED)}>
            Woher die Stromwerte kommen. „Gemeldet“ heißt nicht gemessen: Auch die Anbieter
            schätzen, meist nach einer festen Formel.
          </p>
          <div
            className="flex h-3.5 overflow-hidden rounded-full"
            role="img"
            aria-label={parts.map((p) => `${pct(p.share)} % ${p.label}`).join(', ')}
          >
            {parts.map((p) => (
              <div key={p.label} style={{ flexBasis: `${pct(p.share)}%`, background: p.color }} />
            ))}
          </div>
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[14px]">
            {parts.map((p) => (
              <li key={p.label} className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="size-2.5 rounded-full"
                  style={{ background: p.color }}
                />
                <b className="tabular-nums">{pct(p.share)} %</b> {p.label}
              </li>
            ))}
          </ul>
          <p className={cn('m-0 text-[13px]', MUTED)}>
            Für {pct(footprint.covered_share)} % der erzeugten Tokens gibt es überhaupt einen
            Energiewert. Grundsätzlich nicht enthalten: Training der Modelle, Herstellung der
            Hardware, Datenübertragung. Gezählt wird nur der Betrieb (Inferenz), keine vollständige
            Ökobilanz.
          </p>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <h3 className="nh-display m-0 text-[18px] font-bold">Zwei Bilanzierungsmethoden</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-[var(--nh-deep)] p-4 text-white">
              <p className="nh-display m-0 text-[28px] font-black">
                {formatGrams(footprint.emissions_g)}
              </p>
              <p className="m-0 text-[13px] text-[var(--nh-glow-soft)]">
                standortbasiert · offizielle Bilanz
              </p>
            </div>
            <div className="rounded-xl bg-[var(--nh-mint)] p-4">
              <p className="nh-display m-0 text-[28px] font-black">
                {formatGrams(footprint.market_emissions_g)}
              </p>
              <p className={cn('m-0 text-[13px]', MUTED)}>marktbasiert · mit Ökostrom</p>
            </div>
          </div>
          <p className={cn('m-0 text-[13px] leading-relaxed', MUTED)}>
            Marktbasiert zählt Strom mit benanntem Ökostrom-Nachweis (Herkunftsnachweise,
            EMAS-Registrierung) als emissionsfrei. Für Bildmodelle ist die Region unbekannt, dort
            fallen beide Methoden zusammen. Offiziell zählt der Strommix am Standort.
          </p>
        </div>
      </div>
    </Section>
  );
}

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

export function RechenwegView({
  data,
  feature,
}: {
  data: GetTransparencyStatsResponseDto;
  feature: TransparencyFeature | null;
}) {
  return (
    <>
      <nav aria-label="Abschnitte" className="flex flex-wrap gap-2">
        {SECTIONS.filter(([id]) => !(feature && id === 'r-bereiche')).map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            className="inline-flex min-h-11 items-center rounded-full border border-[var(--nh-line)] px-4 text-[15px] text-[var(--nh-ink)] no-underline hover:bg-[var(--nh-mist)]"
          >
            {label}
          </a>
        ))}
      </nav>
      <Summary data={data} />
      <Formula data={data} />
      <Factors data={data} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Providers data={data} />
        <TextModels data={data} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* One area selected → its own row would be a single full bar. */}
        {!feature && <Areas data={data} />}
        <Unvalued data={data} />
      </div>
      <Reliability data={data} />
      <p className={cn('m-0 text-[13px] leading-relaxed', MUTED)}>
        Kein Wert ist einer einzelnen Person zuzuordnen: Die Summen entstehen in der Datenbank ohne
        Personenbezug, und Tage mit weniger als {data.min_group_size} aktiven Personen entfallen
        {data.suppressed_days > 0 &&
          ` (in diesem Zeitraum ${formatCount(data.suppressed_days)} ${data.suppressed_days === 1 ? 'Tag' : 'Tage'})`}
        . Stand: {formatTimestamp(data.generated_at)} Uhr, alle 15 Minuten neu berechnet.
      </p>
    </>
  );
}
