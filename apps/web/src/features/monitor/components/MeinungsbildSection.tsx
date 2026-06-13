import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Card,
  CardContent,
  LoadingSection,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@gruenerator/ui';
import { ExternalLink } from 'lucide-react';
import { useMemo, useState } from 'react';

import { useMeinungsbild } from '../hooks/useMonitor';
import {
  CATEGORY_ORDER,
  FEATURED_ISSUES,
  MEINUNGSBILD_CATEGORIES,
  estimateColor,
} from '../meinungsbildConfig';

import type { MeinungsbildEstimate, MeinungsbildIssue } from '../hooks/useMonitor';

function nationalAverage(estimates: MeinungsbildEstimate[]): number {
  const totalPop = estimates.reduce((sum, e) => sum + e.pop, 0);
  return estimates.reduce((sum, e) => sum + e.estimate * e.pop, 0) / totalPop;
}

function StateCard({ state_name, estimate }: { state_name: string; estimate: number }) {
  const pct = (estimate * 100).toFixed(0);
  const widthPct = Math.max(estimate * 100, 4);

  return (
    <div className="flex items-center gap-xs p-xs rounded-lg border border-grey-200 dark:border-grey-700">
      <span className="text-xs font-medium text-foreground w-[5.5rem] truncate shrink-0">
        {state_name}
      </span>
      <div className="flex-1 h-4 rounded-full bg-grey-100 dark:bg-grey-800 overflow-hidden">
        <div
          className={`h-full rounded-full ${estimateColor(estimate)} transition-all`}
          style={{ width: `${widthPct}%` }}
        />
      </div>
      <span className="text-xs font-bold tabular-nums w-8 text-right shrink-0">{pct}%</span>
    </div>
  );
}

function IssueGroupedSelect({
  issues,
  selectedId,
  onSelect,
  showAll,
}: {
  issues: MeinungsbildIssue[];
  selectedId: string;
  onSelect: (id: string) => void;
  showAll: boolean;
}) {
  const grouped = useMemo(() => {
    const filtered = showAll ? issues : issues.filter((i) => FEATURED_ISSUES.has(i.id));
    const groups: Record<string, MeinungsbildIssue[]> = {};
    for (const issue of filtered) {
      const cat = issue.category;
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(issue);
    }
    return CATEGORY_ORDER.filter((c) => groups[c]?.length).map((c) => ({
      category: c,
      label: MEINUNGSBILD_CATEGORIES[c] || c,
      issues: groups[c],
    }));
  }, [issues, showAll]);

  return (
    <Select value={selectedId} onValueChange={onSelect}>
      <SelectTrigger className="w-full sm:w-[20rem]">
        <SelectValue placeholder="Thema wählen..." />
      </SelectTrigger>
      <SelectContent>
        {grouped.map((g) => (
          <SelectGroup key={g.category}>
            <SelectLabel>{g.label}</SelectLabel>
            {g.issues.map((issue) => (
              <SelectItem key={issue.id} value={issue.id}>
                {issue.label_de}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}

export function MeinungsbildSection() {
  const { data, isLoading } = useMeinungsbild();
  const [selectedIssueId, setSelectedIssueId] = useState<string>('climate_ego');
  const [showAll, setShowAll] = useState(false);

  if (isLoading) return <LoadingSection />;
  if (!data || data.issues.length === 0) return null;

  const issue = data.issues.find((i) => i.id === selectedIssueId) ?? data.issues[0];
  const estimates = data.estimates[issue.id];
  if (!estimates) return null;

  const avg = nationalAverage(estimates);
  const sorted = [...estimates].sort((a, b) => b.estimate - a.estimate);

  return (
    <div className="mt-xl">
      <div className="border-t border-grey-200 dark:border-grey-700 pt-xl">
        <h3 className="text-lg font-semibold text-foreground-heading">
          Meinungsbild — Was denkt Deutschland?
        </h3>
        <p className="text-xs text-grey-500 mb-md">
          MRP-Schätzungen auf Basis von ~118.000 Befragten (GLES, ALLBUS). Anteil Zustimmung pro
          Bundesland.
        </p>

        <div className="flex flex-wrap items-center gap-sm mb-md">
          <IssueGroupedSelect
            issues={data.issues}
            selectedId={issue.id}
            onSelect={setSelectedIssueId}
            showAll={showAll}
          />
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-xs text-primary-600 hover:underline"
          >
            {showAll ? 'Nur Kernthemen' : 'Alle Themen anzeigen'}
          </button>
        </div>

        <Card className="mb-md">
          <CardContent className="py-sm">
            <p className="text-sm text-foreground/80 italic">„{issue.question_de}"</p>
          </CardContent>
        </Card>

        <div className="mb-md">
          <div className="flex items-center gap-sm mb-xs">
            <span className="text-sm font-medium text-foreground">Deutschland gesamt</span>
            <span className="text-lg font-bold text-primary-600 tabular-nums">
              {(avg * 100).toFixed(0)}%
            </span>
          </div>
          <div className="h-5 rounded-full bg-grey-100 dark:bg-grey-800 overflow-hidden">
            <div
              className={`h-full rounded-full ${estimateColor(avg)} transition-all`}
              style={{ width: `${Math.max(avg * 100, 4)}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-xs">
          {sorted.map((e) => (
            <StateCard key={e.state_code} state_name={e.state_name} estimate={e.estimate} />
          ))}
        </div>

        <div className="mt-md">
          <Accordion
            type="single"
            collapsible
            className="border border-grey-200 dark:border-grey-700 rounded-lg overflow-hidden"
          >
            <AccordionItem value="gerda-info">
              <AccordionTrigger className="px-md py-sm text-sm font-medium text-foreground hover:bg-grey-50 dark:hover:bg-grey-800/50 hover:no-underline">
                Daten: GERDA — German Election Database
              </AccordionTrigger>
              <AccordionContent className="px-md">
                <div className="text-xs text-foreground/80 space-y-sm">
                  <p>
                    Schätzungen basieren auf Multilevel Regression and Poststratification (MRP) mit
                    Daten aus GLES und ALLBUS (~118.000 Befragte). Die Werte zeigen den geschätzten
                    Anteil der Bevölkerung, der der jeweiligen Aussage zustimmt.
                  </p>
                  <p>
                    Heddesheimer, V., Hilbig, H., Sichart, F. & Wiedemann, A. (2025). GERDA: German
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
        </div>
      </div>
    </div>
  );
}
