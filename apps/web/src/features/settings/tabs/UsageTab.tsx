/**
 * "Nutzung" — today's tree budget, what this account has created
 * (UsageWorks), and how much it asked of the Grünerator.
 *
 * Deliberately in the user's terms: requests, images, transcriptions,
 * researches. Tokens, model names and providers are not here since 11.11.2026
 * — they answered "what runs where", which is the platform's question and is
 * answered in full on /transparenz.
 */
import { type UsageFootprintDto } from '@gruenerator/contracts';
import { type QueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { getDocsUrl } from '../../../utils/docsUrl';
import {
  FEATURE_LABELS,
  formatCount,
  formatDuration,
  formatEnergy,
  formatCorridor,
  formatGrams,
  formatDate,
  referenceComparison,
  USAGE_TRACKED_SINCE,
} from '../../../utils/usageFormat';
import { SettingsStatsSkeleton } from '../components/SettingsSkeleton';
import { prefetchTreeBudget, TreeBudgetSection } from '../components/TreeBudgetSection';
import { UsageWorks } from '../components/UsageWorks';
import { usageActivityQuery } from '../hooks/useUsageActivity';
import { usageStatsQuery, useUsageStats } from '../hooks/useUsageStats';
import { useSettingsDialogStore } from '../settingsDialogStore';

/** The range the tab opens on — also the one worth prefetching. */
const DEFAULT_DAYS = 30;

export const prefetch = (queryClient: QueryClient) => {
  void queryClient.prefetchQuery(usageStatsQuery(DEFAULT_DAYS));
  void queryClient.prefetchQuery(usageActivityQuery());
  prefetchTreeBudget(queryClient);
};

const RANGES = [
  { days: 7, label: '7 Tage' },
  { days: 30, label: '30 Tage' },
  { days: 90, label: '90 Tage' },
] as const;

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-grey-200 bg-background p-md dark:border-grey-700">
      <span className="text-xs text-grey-500">{label}</span>
      <span className="text-xl font-semibold text-foreground-heading">{value}</span>
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
        Geschätzt für dieselbe Textarbeit auf GPT-4o. Deinen eigenen Verbrauch weisen wir bewusst
        nicht aus; was die Plattform insgesamt braucht, steht auf der{' '}
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- Link ist auf 'a' gemappt, jsx-a11y prüft dabei nur href statt to; die Navigation ist tastaturzugänglich, onClick schließt nur den Dialog */}
        <Link
          to="/transparenz"
          onClick={() => useSettingsDialogStore.getState().close()}
          className="underline hover:text-foreground"
        >
          Transparenz-Seite
        </Link>
        .
      </p>
      {/* Die Herleitung bleibt vollständig, nur zugeklappt: eine CO₂-Zahl ohne
          sie wäre auf einem Werkzeug der Grünen genau die Behauptung, die
          jemand nachprüft. Sie hängt an dieser Karte und verschwindet mit ihr. */}
      <details className="group text-xs leading-relaxed text-grey-500">
        <summary className="cursor-pointer select-none hover:text-foreground">
          So rechnen wir
        </summary>
        <div className="mt-sm flex flex-col gap-sm">
          <p className="m-0">
            Vergleich zu GPT-4o (Jegham et al. 2025), nur Text — Bilder haben keine vergleichbar
            sauber abgegrenzte OpenAI-Zahl.{' '}
            {comparison.marketDiffers && (
              <>
                Die Spanne umfasst zwei Dinge: die Unsicherheit der GPT-4o-Zahl (±30 %) und die
                beiden anerkannten Bilanzierungsmethoden. Das günstige Ende rechnet unseren Ökostrom
                an (marktbasiert) — unsere Rechenzentren beziehen zertifizierten Grünstrom, Hetzner
                EMAS-geprüft. <strong>Es gilt nur für unsere Seite:</strong> Microsoft kauft
                ebenfalls Erneuerbare ein, aber deren Nachweise können wir nicht verrechnen. Unsere
                Bilanz ist das ungünstige Ende.
              </>
            )}
          </p>
          <FootprintNote footprint={footprint} />
        </div>
      </details>
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
    <p className="m-0">
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
  return (
    <div className="flex flex-col gap-xl">
      <TreeBudgetSection />
      <UsageWorks />
      <section className="flex flex-col gap-lg">
        <div className="flex flex-col gap-1">
          <h2 className="m-0 text-lg font-semibold text-foreground-heading">KI-Verbrauch</h2>
          <p className="m-0 text-sm text-grey-500">
            Erfasst seit {formatDate(USAGE_TRACKED_SINCE)}.
          </p>
        </div>
        <AiUsage />
      </section>
    </div>
  );
}

function AiUsage() {
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

  const { totals, footprint, byFeature } = data;
  const hasAnything =
    totals.requests > 0 ||
    totals.images > 0 ||
    totals.transcriptions > 0 ||
    totals.speech_seconds > 0;
  // Nur Kacheln mit Inhalt: eine Reihe Nullen sagt nichts, was die Leere
  // nicht auch sagt.
  const tiles = [
    { label: 'KI-Anfragen', value: totals.requests, format: formatCount },
    { label: 'Bilder', value: totals.images, format: formatCount },
    { label: 'Transkriptionen', value: totals.transcriptions, format: formatCount },
    { label: 'Web-Recherchen', value: totals.searches, format: formatCount },
    { label: 'Sprachausgabe', value: totals.speech_seconds, format: formatDuration },
  ].filter((tile) => tile.value > 0);

  return (
    <div className="flex flex-col gap-lg">
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <p className="m-0 text-sm text-grey-500">Die letzten {days} Tage.</p>
        <div className="flex shrink-0 gap-1 rounded-lg border border-grey-200 p-1 dark:border-grey-700">
          {RANGES.map((range) => (
            <button
              key={range.days}
              type="button"
              aria-pressed={days === range.days}
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
            {tiles.map((tile) => (
              <StatTile key={tile.label} label={tile.label} value={tile.format(tile.value)} />
            ))}
            {/* No CO2 tile here on purpose: this tab reports what you DID, and
                the comparison below reports what that saved. An individual
                footprint would make one person answerable for a platform
                decision — which model runs where, on whose grid — that is ours,
                not theirs. The platform's own figure is on /transparenz. */}
          </div>

          {/* Pure image usage has emissions but no comparison — the card (and
              the methodology folded into it) only appears when there is one. */}
          {footprint.emissions_g > 0 && <ReferenceComparison footprint={footprint} />}

          {byFeature.length > 1 && (
            <section className="flex flex-col gap-sm">
              <h3 className="m-0 text-sm font-semibold text-foreground-heading">Wofür</h3>
              <ul className="m-0 flex list-none flex-col p-0 text-sm">
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
                    <li
                      key={entry.feature}
                      className="flex items-baseline gap-sm border-b border-grey-100 py-1.5 last:border-0 dark:border-grey-800"
                    >
                      <span className="flex-1">
                        {FEATURE_LABELS[entry.feature] ?? entry.feature}
                      </span>
                      {extras.length > 0 && (
                        <span className="text-xs text-grey-500">{extras.join(' · ')}</span>
                      )}
                      <span className="text-right tabular-nums text-grey-500">
                        {formatCount(entry.requests)} Anfragen
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </>
      )}

      <p className="m-0 text-xs text-grey-500">
        Gezählt werden deine Anfragen an die KI sowie erzeugte Bilder, Transkriptionen,
        Web-Recherchen und Sprachausgabe. Automatische Hintergrundprozesse zählen nicht mit.
      </p>
    </div>
  );
}
