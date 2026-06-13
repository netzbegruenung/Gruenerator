import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Card,
  CardContent,
  LoadingSection,
} from '@gruenerator/ui';
import { ExternalLink } from 'lucide-react';
import { useMemo } from 'react';

import { useMeinungsbild, useStateElections } from '../hooks/useMonitor';
import { estimateColor } from '../meinungsbildConfig';
import { PARTY_COLORS } from '../partyColors';

function partyColor(party: string): string {
  return PARTY_COLORS[party] ?? '#9ca3af';
}

/** Horizontal share bar (party result). */
function ResultBar({ party, share }: { party: string; share: number }) {
  const pct = (share * 100).toFixed(1);
  const color = partyColor(party);
  return (
    <div className="flex items-center gap-xs">
      <span className="text-xs font-medium text-foreground w-[7rem] truncate shrink-0">
        {party}
      </span>
      <div className="flex-1 h-4 rounded-full bg-grey-100 dark:bg-grey-800 overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.max(share * 100, 2)}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-xs font-bold tabular-nums w-12 text-right shrink-0">{pct}%</span>
    </div>
  );
}

/** Approval bar for a Meinungsbild issue in the selected state. */
function IssueBar({ label, estimate }: { label: string; estimate: number }) {
  const pct = (estimate * 100).toFixed(0);
  return (
    <div className="flex items-center gap-xs p-xs rounded-lg border border-grey-200 dark:border-grey-700">
      <span className="text-xs font-medium text-foreground flex-1 truncate" title={label}>
        {label}
      </span>
      <div className="w-24 h-3 rounded-full bg-grey-100 dark:bg-grey-800 overflow-hidden shrink-0">
        <div
          className={`h-full rounded-full ${estimateColor(estimate)} transition-all`}
          style={{ width: `${Math.max(estimate * 100, 4)}%` }}
        />
      </div>
      <span className="text-xs font-bold tabular-nums w-8 text-right shrink-0">{pct}%</span>
    </div>
  );
}

export function LandtagsergebnisCard({ code }: { code: string }) {
  const { data, isLoading } = useStateElections();
  if (isLoading) return <LoadingSection />;

  const state = data?.states[code];
  if (!state) {
    return (
      <Card>
        <CardContent className="py-md text-sm text-grey-500">
          Keine Wahlergebnisse für dieses Bundesland verfügbar.
        </CardContent>
      </Card>
    );
  }

  const sorted = Object.entries(state.results).sort((a, b) => b[1] - a[1]);

  return (
    <div>
      <div className="flex items-baseline justify-between mb-sm">
        <h3 className="text-base font-semibold text-foreground-heading">
          Letzte Landtagswahl {state.electionYear}
        </h3>
        {state.turnout != null && (
          <span className="text-xs text-grey-500">
            Wahlbeteiligung {(state.turnout * 100).toFixed(1)}%
          </span>
        )}
      </div>
      <div className="space-y-xs">
        {sorted.map(([party, share]) => (
          <ResultBar key={party} party={party} share={share} />
        ))}
      </div>
    </div>
  );
}

export function MeinungsbildForState({ code, stateName }: { code: string; stateName: string }) {
  const { data, isLoading } = useMeinungsbild();

  const ranked = useMemo(() => {
    if (!data) return [];
    return data.issues
      .map((issue) => {
        const est = data.estimates[issue.id]?.find((e) => e.state_code === code);
        return est ? { id: issue.id, label: issue.label_de, estimate: est.estimate } : null;
      })
      .filter((x): x is { id: string; label: string; estimate: number } => x !== null)
      .sort((a, b) => b.estimate - a.estimate);
  }, [data, code]);

  if (isLoading) return <LoadingSection />;
  if (ranked.length === 0) return null;

  return (
    <div>
      <h3 className="text-base font-semibold text-foreground-heading mb-xs">
        Meinungsbild — {stateName}
      </h3>
      <p className="text-xs text-grey-500 mb-md">
        MRP-Schätzung des Zustimmungsanteils zu politischen Aussagen, sortiert nach Zustimmung.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-xs">
        {ranked.map((r) => (
          <IssueBar key={r.id} label={r.label} estimate={r.estimate} />
        ))}
      </div>
    </div>
  );
}

export function GerdaAttribution() {
  return (
    <Accordion
      type="single"
      collapsible
      className="border border-grey-200 dark:border-grey-700 rounded-lg overflow-hidden"
    >
      <AccordionItem value="gerda-info">
        <AccordionTrigger className="px-md py-sm text-sm font-medium text-foreground hover:bg-grey-50 dark:hover:bg-grey-800/50 hover:no-underline">
          Daten: GERDA — German Election Database & PolitPro
        </AccordionTrigger>
        <AccordionContent className="px-md">
          <div className="text-xs text-foreground/80 space-y-sm">
            <p>
              Wahlergebnisse und Meinungsbild (MRP-Schätzung) stammen aus GERDA; die Sonntagsfrage
              wird über PolitPro aggregiert.
            </p>
            <p>
              Heddesheimer, V., Hilbig, H., Sichart, F. &amp; Wiedemann, A. (2025). GERDA: German
              Election Database. <em>Nature: Scientific Data</em>, 12: 618.
            </p>
            <a
              href="https://github.com/awiedem/german_election_data"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-primary-600 hover:underline"
            >
              github.com/awiedem/german_election_data
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
