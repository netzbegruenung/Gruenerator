/**
 * "Nutzung" — what this account has consumed.
 *
 * Shows real numbers rather than an abstract quota: requests and tokens per
 * day, broken down by tool and by model, plus the non-token operations
 * (generated images, transcriptions, web researches). The daily chart is plain
 * CSS bars — a charting library would be a lot of bundle for ten numbers.
 */
import { type UsageFeature } from '@gruenerator/contracts';
import { useState } from 'react';

import Spinner from '../../../components/common/Spinner';
import { useUsageStats } from '../hooks/useUsageStats';

const RANGES = [
  { days: 7, label: '7 Tage' },
  { days: 30, label: '30 Tage' },
  { days: 90, label: '90 Tage' },
] as const;

const FEATURE_LABELS: Record<UsageFeature, string> = {
  chat: 'Chat',
  docs: 'Dokumente',
  sheets: 'Tabellen',
  presentations: 'Präsentationen',
  boards: 'Boards',
  sharepic: 'Sharepics & Bilder',
  subtitler: 'Untertitel',
  search: 'Suche & Recherche',
  monitor: 'Monitor',
  sites: 'Websites',
  texte: 'Texte',
  notebook: 'Notebooks',
  other: 'Sonstiges',
};

const UNIT_LABELS: Record<string, string> = {
  tokens: 'Tokens',
  images: 'Bilder',
  transcriptions: 'Transkriptionen',
  searches: 'Recherchen',
};

const numberFormat = new Intl.NumberFormat('de-DE');

function formatCount(value: number): string {
  return numberFormat.format(value);
}

/** Long token counts get an abbreviated form so the tiles stay readable. */
function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${numberFormat.format(Math.round(value / 100_000) / 10)} Mio.`;
  if (value >= 10_000) return `${numberFormat.format(Math.round(value / 1000))} Tsd.`;
  return numberFormat.format(value);
}

function formatDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? day
    : date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-grey-200 bg-background p-md dark:border-grey-700">
      <span className="text-xs text-grey-500">{label}</span>
      <span className="text-xl font-semibold text-foreground-heading">{value}</span>
      {hint && <span className="text-xs text-grey-500">{hint}</span>}
    </div>
  );
}

export default function UsageTab() {
  const [days, setDays] = useState<number>(30);
  const { data, isPending, isError } = useUsageStats(days);

  if (isPending) {
    return (
      <div className="flex justify-center py-xl">
        <Spinner size="medium" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <p className="m-0 text-sm text-grey-500">
        Die Nutzungsdaten konnten nicht geladen werden. Bitte versuche es später erneut.
      </p>
    );
  }

  const { totals, daily, byFeature, byModel } = data;
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
          </div>

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
