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
  FEATURE_LABELS,
  formatCount,
  formatDay,
  formatDuration,
  formatEnergy,
  formatCorridor,
  formatGrams,
  formatTokens,
  FUNCTION_LABELS,
  FUNCTION_ORDER,
  providerLabel,
  referenceComparison,
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
 * CO2: shows the difference in whichever direction it points, plus a corridor,
 * because the GPT-4o side is an estimate the source paper itself flags as
 * uncertain.
 *
 * Deliberately shows only the DIFFERENCE, never this account's own figure —
 * neither in grams nor in watt-hours. Confronting a single person with "your
 * CO2" makes an individual responsible for a platform decision they did not
 * make: which model runs where, and on whose grid, is ours to answer. The
 * platform's own consumption is published in full on the transparency page,
 * where it belongs.
 *
 * The direction is still reported honestly. Where the comparison goes against
 * us the heading and label say so rather than hiding the card.
 */
function ReferenceComparison({ footprint }: { footprint: UsageFootprintDto }) {
  const comparison = referenceComparison(footprint);
  // Only vanish when there is nothing to compare — an unfavorable comparison
  // is reported, not hidden (see the JSDoc above).
  if (!comparison.hasComparison) return null;
  const co2Saved = comparison.saved;

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
            ≈ {formatGrams(comparison.magnitude)}
          </span>
          <span className="text-xs text-grey-500">
            {formatCorridor(comparison.worst, comparison.best)}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-grey-500">Strom bei ChatGPT</span>
          <span className="text-lg font-semibold text-foreground-heading">
            ≈ {formatEnergy(footprint.reference_energy_wh)}
          </span>
          <span className="text-xs text-grey-500">für dieselbe Arbeit auf GPT-4o</span>
        </div>
      </div>
      <p className="m-0 text-xs leading-relaxed text-grey-500">
        Vergleich zu GPT-4o (Jegham et al. 2025), nur Text — Bilder haben keine vergleichbar sauber
        abgegrenzte OpenAI-Zahl. Deinen eigenen Verbrauch weisen wir bewusst nicht aus; was die
        Plattform insgesamt braucht, steht auf der Transparenz-Seite.{' '}
        {comparison.marketDiffers && (
          <>
            Die Spanne umfasst zwei Dinge: die Unsicherheit der GPT-4o-Zahl (±30 %) und die beiden
            anerkannten Bilanzierungsmethoden. Das günstige Ende rechnet unseren Ökostrom an
            (marktbasiert) — unsere Rechenzentren beziehen zertifizierten Grünstrom, Hetzner
            EMAS-geprüft. <strong>Es gilt nur für unsere Seite:</strong> Microsoft kauft ebenfalls
            Erneuerbare ein, aber deren Nachweise können wir nicht verrechnen. Unsere Bilanz ist das
            ungünstige Ende.{' '}
          </>
        )}
        <a
          href={`${getDocsUrl()}/docs/basics/nachhaltigkeit`}
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
        ? `${formatCount(measuredPct)} % der Ersparnis oben stützen sich auf Messwerte, die unser Anbieter GreenPT mitliefert. Der Rest ist `
        : 'Die Ersparnis oben ist '}
      aus Token-Zahlen hochgerechnet — mit Energiewerten, die an genau denselben Modellen gemessen
      wurden.{' '}
      {boundedPct > 0 && (
        <>
          Für {formatCount(boundedPct)} % ist das Modell selbst nirgends gemessen; dort rechnen wir
          mit der <strong>Mitte</strong> zwischen zwei Modellen, die wir gemessen haben — nicht mit
          dem günstigen und nicht mit dem ungünstigen Rand.{' '}
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
        href={`${getDocsUrl()}/docs/basics/nachhaltigkeit`}
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
  const hasAnything =
    totals.requests > 0 ||
    totals.images > 0 ||
    totals.transcriptions > 0 ||
    totals.speech_seconds > 0;

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
            <StatTile label="Sprachausgabe" value={formatDuration(totals.speech_seconds)} />
            {/* No CO2 tile here on purpose: this tab reports what you DID, and
                the comparison below reports what that saved. An individual
                footprint would make one person answerable for a platform
                decision — which model runs where, on whose grid — that is ours,
                not theirs. The platform's own figure is on /transparenz. */}
          </div>

          {/* One gate for both: the note explains the card, so it must not
              outlive it. Pure image usage has emissions but no comparison. */}
          {footprint.emissions_g > 0 && referenceComparison(footprint).hasComparison && (
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
                      entry.speech_seconds
                        ? `${formatDuration(entry.speech_seconds)} Sprachausgabe`
                        : null,
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

          {/* Grouped by what the model DOES, not flat: Voxtral and Linkup are
              not chat models with a strange unit, and a flat list made them
              read that way. */}
          <section className="flex flex-col gap-md">
            <h3 className="m-0 text-sm font-semibold text-foreground-heading">Nach Funktion</h3>
            {FUNCTION_ORDER.map((unit) => {
              const rows = byModel.filter((entry) => entry.unit === unit);
              if (rows.length === 0) return null;
              return (
                <div key={unit} className="flex flex-col gap-1">
                  <h4 className="m-0 text-xs font-semibold uppercase tracking-wide text-grey-500">
                    {FUNCTION_LABELS[unit]}
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[28rem] text-sm">
                      <thead>
                        <tr className="border-b border-grey-200 text-left text-xs text-grey-500 dark:border-grey-700">
                          <th className="py-1 font-normal">Modell</th>
                          <th className="py-1 font-normal">Anbieter</th>
                          <th className="py-1 text-right font-normal">
                            {unit === 'tokens' ? 'Anfragen' : UNIT_LABELS[unit]}
                          </th>
                          {unit === 'tokens' && (
                            <th className="py-1 text-right font-normal">Tokens</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((entry) => (
                          <tr
                            key={`${entry.provider}|${entry.model}`}
                            className="border-b border-grey-100 last:border-0 dark:border-grey-800"
                          >
                            <td className="py-1.5">{entry.model}</td>
                            <td className="py-1.5 text-grey-500">
                              {providerLabel(entry.provider)}
                            </td>
                            <td className="py-1.5 text-right tabular-nums">
                              {formatCount(unit === 'tokens' ? entry.requests : entry.ops)}
                            </td>
                            {unit === 'tokens' && (
                              <td className="py-1.5 text-right tabular-nums">
                                {formatCount(entry.total_tokens)}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </section>
        </>
      )}

      <p className="m-0 text-xs text-grey-500">
        Erfasst werden Anfragen an KI-Modelle sowie erzeugte Bilder, Transkriptionen, Web-Recherchen
        und die Dauer der Sprachausgabe. Automatische Hintergrundprozesse zählen nicht mit.
      </p>
    </div>
  );
}
