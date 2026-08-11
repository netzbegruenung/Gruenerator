/**
 * "Nutzung" — what this account has consumed.
 *
 * Shows real numbers rather than an abstract quota: requests and tokens per
 * day, broken down by tool and by model, plus the non-token operations
 * (generated images, transcriptions, web researches). The daily chart is plain
 * CSS bars — a charting library would be a lot of bundle for ten numbers.
 */
import { type UsageFootprintDto } from '@gruenerator/contracts';
import { type QueryClient } from '@tanstack/react-query';
import { useState } from 'react';

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
import { SettingsStatsSkeleton } from '../components/SettingsSkeleton';
import { usageStatsQuery, useUsageStats } from '../hooks/useUsageStats';

/** The range the tab opens on — also the one worth prefetching. */
const DEFAULT_DAYS = 30;

export const prefetch = (queryClient: QueryClient) => {
  void queryClient.prefetchQuery(usageStatsQuery(DEFAULT_DAYS));
};

const RANGES = [
  { days: 7, label: '7 Tage' },
  { days: 30, label: '30 Tage' },
  { days: 90, label: '90 Tage' },
] as const;

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-grey-200 bg-background p-md dark:border-grey-700">
      <span className="text-xs text-grey-500">{label}</span>
      <span className="text-xl font-semibold text-foreground-heading">{value}</span>
      {hint && <span className="text-xs text-grey-500">{hint}</span>}
    </div>
  );
}

/**
 * "What if you had used ChatGPT instead."
 *
 * CO2: shows the difference in whichever direction it points, not your own
 * figure again — that's already the stat tile above this card — plus a
 * corridor, because the GPT-4o side is an estimate the source paper itself
 * flags as uncertain.
 *
 * Energy still reports both directions: our default Mistral Medium needs MORE
 * raw electricity than GPT-4o reportedly does, and the CO2 advantage comes
 * from the French grid, not from sparser engineering. Collapsing that to a
 * "savings" framing too would hide the one place this comparison doesn't
 * flatter us.
 */
function ReferenceComparison({ footprint }: { footprint: UsageFootprintDto }) {
  // Text only on both sides. The reference costs the same TOKENS on GPT-4o and
  // has no image half at all, so comparing it against a total that includes
  // Flux would invent a saving out of an accounting mismatch.
  const textEmissions = footprint.emissions_g - footprint.image_emissions_g;
  const textEnergy = footprint.energy_wh - footprint.image_energy_wh;
  const co2Savings = footprint.reference_emissions_g - textEmissions;
  const energyFactor = textEnergy > 0 ? footprint.reference_energy_wh / textEnergy : 0;
  // Only vanish when there is nothing to compare — an unfavorable comparison
  // is reported, not hidden (see the JSDoc above).
  const hasTextUsage = textEmissions > 0 || textEnergy > 0 || footprint.reference_emissions_g > 0;
  if (!hasTextUsage) return null;

  const co2Saved = co2Savings >= 0;
  const co2SavingsLow = Math.max(
    co2Saved
      ? footprint.reference_emissions_g * (1 - REFERENCE_UNCERTAINTY) - textEmissions
      : textEmissions - footprint.reference_emissions_g * (1 + REFERENCE_UNCERTAINTY),
    0
  );
  const co2SavingsHigh = Math.max(
    co2Saved
      ? footprint.reference_emissions_g * (1 + REFERENCE_UNCERTAINTY) - textEmissions
      : textEmissions - footprint.reference_emissions_g * (1 - REFERENCE_UNCERTAINTY),
    0
  );

  return (
    <section className="flex flex-col gap-sm rounded-xl border border-grey-200 p-md dark:border-grey-700">
      <h3 className="m-0 text-sm font-semibold text-foreground-heading">
        {co2Saved ? 'Ersparnis gegenüber ChatGPT' : 'Vergleich zu ChatGPT'}
      </h3>
      <div className="grid grid-cols-2 gap-sm">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-grey-500">
            {co2Saved ? 'CO₂ gespart' : 'CO₂ mehr als bei GPT-4o'}
          </span>
          <span className="text-lg font-semibold text-foreground-heading">
            ≈ {formatGrams(Math.abs(co2Savings))}
          </span>
          <span className="text-xs text-grey-500">
            etwa {formatGrams(co2SavingsLow)} – {formatGrams(co2SavingsHigh)}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-grey-500">Energie</span>
          <span className="text-lg font-semibold text-foreground-heading">
            ≈ {formatEnergy(footprint.reference_energy_wh)}
          </span>
          <span className="text-xs text-grey-500">
            statt {formatEnergy(textEnergy)}
            {energyFactor > 0 && (
              <>
                {' — '}
                {energyFactor >= 1
                  ? `${oneDecimal.format(energyFactor)}× so viel`
                  : `${oneDecimal.format(1 / energyFactor)}× weniger als bei uns`}
              </>
            )}
          </span>
        </div>
      </div>
      <p className="m-0 text-xs leading-relaxed text-grey-500">
        Vergleich zu GPT-4o (Jegham et al. 2025), nur Text — Bilder haben keine vergleichbar sauber
        abgegrenzte OpenAI-Zahl.{' '}
        <a
          href={`${getDocsUrl()}/docs/ueber-den-gruenerator/nachhaltigkeit`}
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-foreground"
        >
          Wie wir rechnen
        </a>
      </p>
    </section>
  );
}

/**
 * The number above is part measurement, part extrapolation, and covers only the
 * text models. Saying so is not optional garnish — an unqualified CO2 figure on
 * a Green party's tool is exactly the kind of claim that gets checked.
 */
function FootprintNote({ footprint }: { footprint: UsageFootprintDto }) {
  const measuredPct = Math.round(footprint.measured_share * 100);
  const boundedPct = Math.round(footprint.bounded_share * 100);
  const coveredPct = Math.round(footprint.covered_share * 100);
  return (
    <p className="m-0 rounded-xl border border-grey-200 p-md text-xs leading-relaxed text-grey-500 dark:border-grey-700">
      {measuredPct > 0
        ? `${formatCount(measuredPct)} % dieser Zahl sind Messwerte, die unser Anbieter GreenPT mitliefert. Der Rest ist `
        : 'Die Zahl ist '}
      aus deinen Token-Zahlen hochgerechnet — mit Energiewerten, die an genau denselben Modellen
      gemessen wurden.{' '}
      {boundedPct > 0 && (
        <>
          Für {formatCount(boundedPct)} % gibt es kein messbares Gegenstück; dort rechnen wir
          bewusst mit der <strong>Obergrenze</strong> der gemessenen Spanne, damit die Zahl eher zu
          hoch als zu niedrig ausfällt.{' '}
        </>
      )}
      {coveredPct < 100 && (
        <>Erfasst sind {formatCount(coveredPct)} % der erzeugten Tokens im Zeitraum. </>
      )}
      Erzeugte Tokens bestimmen den Verbrauch, gesendete kosten 100- bis 760-mal weniger.{' '}
      {footprint.image_emissions_g > 0 && (
        <>
          Erzeugte Bilder sind mit veröffentlichten Messungen an denselben Diffusionsmodellen
          angesetzt (Iyengar et al., 2025) — dort ist der Aufschlag für Rechenzentrumstechnik unsere
          eigene, bewusst großzügige Annahme.{' '}
        </>
      )}
      Transkription und Web-Recherche fehlen, weil dafür keine Messwerte vorliegen.{' '}
      <a
        href={`${getDocsUrl()}/docs/ueber-den-gruenerator/nachhaltigkeit`}
        target="_blank"
        rel="noreferrer"
        className="underline hover:text-foreground"
      >
        Wie wir rechnen
      </a>
    </p>
  );
}

export default function UsageTab() {
  const [days, setDays] = useState<number>(DEFAULT_DAYS);
  const { data, isPending, isError } = useUsageStats(days);

  if (isPending) return <SettingsStatsSkeleton />;

  if (isError || !data) {
    return (
      <p className="m-0 text-sm text-grey-500">
        Die Nutzungsdaten konnten nicht geladen werden. Bitte versuche es später erneut.
      </p>
    );
  }

  const { totals, footprint, daily, byFeature, byModel } = data;
  const maxDayTokens = daily.reduce((max, d) => Math.max(max, d.input_tokens + d.output_tokens), 0);
  const hasAnything = totals.requests > 0 || totals.images > 0 || totals.transcriptions > 0;

  return (
    <div className="flex flex-col gap-lg">
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <p className="m-0 text-sm text-grey-500">
          Dein Verbrauch über die letzten {days} Tage. Die Zahlen aktualisieren sich wenige Sekunden
          nach einer Anfrage.
        </p>
        <div className="flex shrink-0 gap-1 rounded-lg border border-grey-200 p-1 dark:border-grey-700">
          {RANGES.map((range) => (
            <button
              key={range.days}
              type="button"
              onClick={() => setDays(range.days)}
              className={`rounded-md px-2 py-1 text-xs transition-colors ${
                days === range.days
                  ? 'bg-background-alt font-semibold text-foreground'
                  : 'text-grey-500 hover:text-foreground'
              }`}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      {!hasAnything ? (
        <p className="m-0 rounded-xl border border-dashed border-grey-300 p-lg text-sm text-grey-500 dark:border-grey-700">
          In diesem Zeitraum wurde noch nichts verbraucht.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-sm md:grid-cols-3">
            <StatTile label="KI-Anfragen" value={formatCount(totals.requests)} />
            <StatTile
              label="Tokens gesamt"
              value={formatTokens(totals.total_tokens)}
              hint={`${formatTokens(totals.input_tokens)} rein · ${formatTokens(totals.output_tokens)} raus`}
            />
            <StatTile label="Bilder" value={formatCount(totals.images)} />
            <StatTile label="Transkriptionen" value={formatCount(totals.transcriptions)} />
            <StatTile label="Web-Recherchen" value={formatCount(totals.searches)} />
            {footprint.emissions_g > 0 && (
              <StatTile
                label="CO₂ deiner KI-Nutzung"
                value={`≈ ${formatGrams(footprint.emissions_g)}`}
                hint={
                  // A single generated image outweighs several hundred chat
                  // turns, so where the number comes from matters more than the
                  // number: without the split people optimise the wrong thing.
                  footprint.image_emissions_g > 0
                    ? `davon ${formatGrams(footprint.image_emissions_g)} aus Bildern · so viel wie ${carComparison(footprint.emissions_g)}`
                    : `${formatEnergy(footprint.energy_wh)} · so viel wie ${carComparison(footprint.emissions_g)}`
                }
              />
            )}
          </div>

          {footprint.emissions_g > 0 && (
            <>
              <ReferenceComparison footprint={footprint} />
              <FootprintNote footprint={footprint} />
            </>
          )}

          <section className="flex flex-col gap-sm">
            <h3 className="m-0 text-sm font-semibold text-foreground-heading">Tokens pro Tag</h3>
            {maxDayTokens === 0 ? (
              <p className="m-0 text-sm text-grey-500">Keine Token-Nutzung im Zeitraum.</p>
            ) : (
              <div className="flex h-40 items-end gap-[2px] overflow-x-auto rounded-xl border border-grey-200 p-sm dark:border-grey-700">
                {daily.map((entry) => {
                  const total = entry.input_tokens + entry.output_tokens;
                  const heightPct = Math.max(2, Math.round((total / maxDayTokens) * 100));
                  const outputPct = total > 0 ? Math.round((entry.output_tokens / total) * 100) : 0;
                  return (
                    <div
                      key={entry.day}
                      className="flex min-w-[6px] flex-1 flex-col justify-end"
                      style={{ height: '100%' }}
                      title={`${formatDay(entry.day)}: ${formatCount(total)} Tokens (${formatCount(entry.requests)} Anfragen)`}
                    >
                      <div
                        className="flex w-full flex-col justify-end overflow-hidden rounded-sm bg-primary/30"
                        style={{ height: `${heightPct}%` }}
                      >
                        <div className="w-full bg-primary" style={{ height: `${outputPct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="m-0 text-xs text-grey-500">
              Dunkel = erzeugte Tokens, hell = gesendete Tokens.
            </p>
          </section>

          <section className="flex flex-col gap-sm">
            <h3 className="m-0 text-sm font-semibold text-foreground-heading">Nach Bereich</h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[28rem] text-sm">
                <thead>
                  <tr className="border-b border-grey-200 text-left text-xs text-grey-500 dark:border-grey-700">
                    <th className="py-1 font-normal">Bereich</th>
                    <th className="py-1 text-right font-normal">Anfragen</th>
                    <th className="py-1 text-right font-normal">Tokens</th>
                    <th className="py-1 text-right font-normal">Sonstiges</th>
                  </tr>
                </thead>
                <tbody>
                  {byFeature.map((entry) => {
                    const extras = [
                      entry.images ? `${formatCount(entry.images)} Bilder` : null,
                      entry.transcriptions
                        ? `${formatCount(entry.transcriptions)} Transkriptionen`
                        : null,
                      entry.searches ? `${formatCount(entry.searches)} Recherchen` : null,
                    ].filter(Boolean);
                    return (
                      <tr
                        key={entry.feature}
                        className="border-b border-grey-100 last:border-0 dark:border-grey-800"
                      >
                        <td className="py-1.5">{FEATURE_LABELS[entry.feature] ?? entry.feature}</td>
                        <td className="py-1.5 text-right tabular-nums">
                          {formatCount(entry.requests)}
                        </td>
                        <td className="py-1.5 text-right tabular-nums">
                          {formatCount(entry.total_tokens)}
                        </td>
                        <td className="py-1.5 text-right text-xs text-grey-500">
                          {extras.length ? extras.join(' · ') : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="flex flex-col gap-sm">
            <h3 className="m-0 text-sm font-semibold text-foreground-heading">Nach Modell</h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[28rem] text-sm">
                <thead>
                  <tr className="border-b border-grey-200 text-left text-xs text-grey-500 dark:border-grey-700">
                    <th className="py-1 font-normal">Modell</th>
                    <th className="py-1 font-normal">Anbieter</th>
                    <th className="py-1 text-right font-normal">Anfragen</th>
                    <th className="py-1 text-right font-normal">Menge</th>
                  </tr>
                </thead>
                <tbody>
                  {byModel.map((entry) => (
                    <tr
                      key={`${entry.provider}|${entry.model}|${entry.unit}`}
                      className="border-b border-grey-100 last:border-0 dark:border-grey-800"
                    >
                      <td className="py-1.5">{entry.model}</td>
                      <td className="py-1.5 text-grey-500">{entry.provider}</td>
                      <td className="py-1.5 text-right tabular-nums">
                        {formatCount(entry.unit === 'tokens' ? entry.requests : entry.ops)}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">
                        {entry.unit === 'tokens'
                          ? `${formatCount(entry.total_tokens)} Tokens`
                          : `${formatCount(entry.ops)} ${UNIT_LABELS[entry.unit] ?? entry.unit}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <p className="m-0 text-xs text-grey-500">
        Erfasst werden Anfragen an KI-Modelle sowie erzeugte Bilder, Transkriptionen und
        Web-Recherchen. Automatische Hintergrundprozesse zählen nicht mit.
      </p>
    </div>
  );
}
