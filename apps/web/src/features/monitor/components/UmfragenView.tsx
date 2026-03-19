import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  LoadingSection,
} from '@gruenerator/ui';
import { TrendingDown, TrendingUp, Minus, ExternalLink } from 'lucide-react';

import { usePolls } from '../hooks/useMonitor';

const PARTY_COLORS: Record<string, string> = {
  'CDU/CSU': '#000000',
  AfD: '#009ee0',
  SPD: '#e3000f',
  GRÜNE: '#46962b',
  'DIE LINKE': '#be3075',
  BSW: '#571D47',
  FDP: '#ffed00',
  Sonstige: '#aaaaaa',
};

const PARTY_ORDER = ['CDU/CSU', 'AfD', 'SPD', 'GRÜNE', 'DIE LINKE', 'BSW', 'FDP', 'Sonstige'];
const PARTY_SHORT: Record<string, string> = {
  'CDU/CSU': 'Union',
  AfD: 'AfD',
  SPD: 'SPD',
  GRÜNE: 'Grüne',
  'DIE LINKE': 'Linke',
  BSW: 'BSW',
  FDP: 'FDP',
  Sonstige: 'Sonst.',
};

function PartyColumn({
  value,
  color,
  max,
  label,
  election,
}: {
  value: number | null;
  color: string;
  max: number;
  label: string;
  election?: number | null;
}) {
  const height = value != null && max > 0 ? (value / max) * 100 : 0;
  const isGruene = label === 'Grüne';

  return (
    <div className={`flex flex-col items-center gap-1 w-12 shrink-0 ${isGruene ? 'relative' : ''}`}>
      {isGruene && (
        <div className="absolute inset-0 -top-2 -bottom-2 bg-green-50 dark:bg-green-950/20 rounded-md -z-10" />
      )}
      <span className="text-xs font-bold tabular-nums">{value != null ? `${value}%` : '—'}</span>
      <TrendBadge current={value ?? 0} previous={election} />
      <div className="w-full flex items-end justify-center" style={{ height: 120 }}>
        <div
          className="w-full max-w-[2.5rem] rounded-t-sm transition-all"
          style={{ height: `${height}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-[11px] font-bold mt-1" style={{ color }}>
        {label}
      </span>
    </div>
  );
}

function TrendBadge({
  current,
  previous,
}: {
  current: number;
  previous: number | null | undefined;
}) {
  if (previous == null) return null;
  const diff = Math.round((current - previous) * 10) / 10;
  if (diff === 0) return <Minus className="h-3 w-3 text-grey-400" />;

  return (
    <span
      className={`flex items-center gap-0.5 text-[10px] font-medium ${
        diff > 0 ? 'text-green-600' : 'text-red-500'
      }`}
    >
      {diff > 0 ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
      {diff > 0 ? '+' : ''}
      {diff}
    </span>
  );
}

export function UmfragenView() {
  const { data, isLoading } = usePolls();

  if (isLoading) return <LoadingSection />;
  if (!data || data.polls.length === 0) {
    return (
      <Card>
        <CardContent className="py-lg text-center text-sm text-grey-500">
          Keine Umfragedaten verfügbar.
        </CardContent>
      </Card>
    );
  }

  const maxAvg = Math.max(...Object.values(data.average), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sonntagsfrage</CardTitle>
        <CardDescription>
          Wenn am nächsten Sonntag Bundestagswahl wäre… Durchschnitt aus {data.polls.length}{' '}
          Instituten.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Vertical column chart */}
        <div className="flex items-end gap-3 mb-lg px-sm justify-center">
          {PARTY_ORDER.filter((p) => data.average[p] != null).map((party) => (
            <PartyColumn
              key={party}
              value={data.average[party]}
              color={PARTY_COLORS[party]}
              max={maxAvg}
              label={PARTY_SHORT[party]}
              election={data.lastElection?.parties[party]}
            />
          ))}
        </div>

        {/* Institute detail table */}
        <details className="group">
          <summary className="cursor-pointer text-xs font-medium text-grey-500 hover:text-foreground transition-colors select-none">
            Einzelne Institute anzeigen
          </summary>
          <div className="mt-md overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="text-left pb-sm pr-sm text-grey-500 font-normal sticky left-0 bg-background">
                    Institut
                  </th>
                  <th className="text-left pb-sm pr-sm text-grey-500 font-normal">Datum</th>
                  {PARTY_ORDER.map((party) => (
                    <th
                      key={party}
                      className="pb-sm px-1.5 text-center font-semibold"
                      style={{ color: PARTY_COLORS[party] }}
                    >
                      {PARTY_SHORT[party]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Average row */}
                <tr className="border-t-2 border-grey-300 dark:border-grey-600 bg-grey-50 dark:bg-grey-800/50 font-bold">
                  <td className="py-2 pr-sm sticky left-0 bg-grey-50 dark:bg-grey-800/50">
                    ⌀ Durchschnitt
                  </td>
                  <td className="py-2 pr-sm text-grey-500">—</td>
                  {PARTY_ORDER.map((party) => {
                    const val = data.average[party];
                    const isGruene = party === 'GRÜNE';
                    return (
                      <td
                        key={party}
                        className={`py-2 px-1.5 text-center ${isGruene ? 'text-green-600' : ''}`}
                      >
                        {val != null ? `${val}%` : '—'}
                      </td>
                    );
                  })}
                </tr>
                {/* Institute rows */}
                {data.polls.map((poll) => (
                  <tr
                    key={poll.institute}
                    className="border-t border-grey-100 dark:border-grey-800"
                  >
                    <td className="py-1.5 pr-sm text-foreground sticky left-0 bg-background">
                      {poll.institute}
                    </td>
                    <td className="py-1.5 pr-sm text-grey-400 whitespace-nowrap">{poll.date}</td>
                    {PARTY_ORDER.map((party) => {
                      const val = poll.parties[party];
                      const isGruene = party === 'GRÜNE';
                      return (
                        <td
                          key={party}
                          className={`py-1.5 px-1.5 text-center ${isGruene ? 'font-semibold text-green-600' : 'text-foreground'}`}
                        >
                          {val !== null ? `${val}%` : '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {/* BTW row */}
                {data.lastElection && (
                  <tr className="border-t-2 border-grey-300 dark:border-grey-600">
                    <td className="py-2 pr-sm text-foreground font-medium sticky left-0 bg-background">
                      BTW 2025
                    </td>
                    <td className="py-2 pr-sm text-grey-400">{data.lastElection.date}</td>
                    {PARTY_ORDER.map((party) => {
                      const val = data.lastElection?.parties[party];
                      return (
                        <td key={party} className="py-2 px-1.5 text-center text-grey-500">
                          {val !== null ? `${val}%` : '—'}
                        </td>
                      );
                    })}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </details>
        <div className="flex justify-end mt-md">
          <a
            href="https://www.wahlrecht.de/umfragen/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-grey-400 hover:text-foreground transition-colors"
          >
            Quelle: wahlrecht.de
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
