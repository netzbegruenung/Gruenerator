import { type ContentSyncRun, type ContentSyncRunFilter } from '@gruenerator/contracts';
import { Skeleton, Switch, toast } from '@gruenerator/ui';
import { useId, useState } from 'react';

import { cn } from '../../../utils/cn';
import {
  useContentSyncRuns,
  useContentSyncSettings,
  useSetContentSyncEmail,
} from '../hooks/useAdminContentSync';

const FILTERS: { key: ContentSyncRunFilter; label: string }[] = [
  { key: 'all', label: 'Alle Läufe' },
  { key: 'problems', label: 'Nur Probleme' },
];

const dateTime = new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' });

function hasProblem(run: ContentSyncRun): boolean {
  return run.status === 'failed' || run.errors > 0;
}

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} s` : `${Math.round(s / 60)} min`;
}

function StatusLabel({ run }: { run: ContentSyncRun }) {
  const label =
    run.status === 'failed' ? 'Abgebrochen' : run.errors > 0 ? `${run.errors} Fehler` : 'OK';
  return (
    <span
      className={cn(
        'text-xs font-medium',
        hasProblem(run) ? 'text-red-600 dark:text-red-400' : 'text-grey-500 dark:text-grey-400'
      )}
    >
      {label}
    </span>
  );
}

function EmailSwitch() {
  const id = useId();
  const { data: enabled, isLoading } = useContentSyncSettings();
  const setEmail = useSetContentSyncEmail();

  return (
    <div className="flex items-start gap-md mb-lg">
      <Switch
        id={id}
        checked={enabled ?? false}
        disabled={isLoading || setEmail.isPending}
        onCheckedChange={(next) =>
          setEmail.mutate(next, {
            onError: () => toast.error('Die Einstellung konnte nicht gespeichert werden.'),
          })
        }
      />
      <div>
        <label htmlFor={id} className="text-sm font-medium text-foreground">
          Berichte zusätzlich per Mail senden
        </label>
        <p className="text-sm text-grey-500 dark:text-grey-400 m-0">
          Eine Mail je Landesverband-Lauf mit Neuem oder Fehlern und der nächtliche Sammelbericht.
          Ist der Schalter aus, steht alles nur hier.
        </p>
      </div>
    </div>
  );
}

/** The newest run per source and Landesverband, from a list sorted newest first. */
function latestPerTarget(runs: ContentSyncRun[]): ContentSyncRun[] {
  const seen = new Map<string, ContentSyncRun>();
  for (const run of runs) {
    const key = `${run.sourceId}:${run.landesverband ?? ''}`;
    if (!seen.has(key)) seen.set(key, run);
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

function RunDetails({ run }: { run: ContentSyncRun }) {
  // De-duplicated: the same message can repeat, and it doubles as the list key.
  const samples = [
    ...new Set(run.failureMessage ? [run.failureMessage, ...run.errorSamples] : run.errorSamples),
  ];
  const deadLinks = [...new Set(run.deadLinkSamples)];
  if (samples.length === 0 && deadLinks.length === 0 && !run.runUrl) return null;
  return (
    <details className="mt-xs">
      <summary className="text-xs text-grey-500 dark:text-grey-400 cursor-pointer">Details</summary>
      <ul className="mt-xs pl-md text-xs text-foreground break-all">
        {samples.map((s) => (
          <li key={`e:${s}`}>{s}</li>
        ))}
        {deadLinks.map((s) => (
          <li key={`d:${s}`} className="text-grey-500 dark:text-grey-400">
            Toter Link: {s}
          </li>
        ))}
      </ul>
      {run.runUrl && (
        <a
          href={run.runUrl}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-primary underline"
        >
          GitHub-Lauf öffnen
        </a>
      )}
    </details>
  );
}

function RunRow({ run }: { run: ContentSyncRun }) {
  return (
    <li className="py-sm border-b border-grey-200 dark:border-grey-700 list-none">
      <div className="flex flex-wrap items-baseline justify-between gap-x-md">
        <span className="text-sm font-medium text-foreground">
          {run.name}
          {run.dryRun && <span className="text-grey-500 font-normal"> · Probelauf</span>}
        </span>
        <StatusLabel run={run} />
      </div>
      <div className="text-xs text-grey-500 dark:text-grey-400">
        {dateTime.format(new Date(run.startedAt))} · {run.recent ? 'stündlich' : 'voll'} ·{' '}
        {formatDuration(run.durationMs)} · +{run.stored} neu, {run.updated} aktualisiert,{' '}
        {run.skipped} unverändert
        {run.deadLinks > 0 && `, ${run.deadLinks} tote Links`}
      </div>
      <RunDetails run={run} />
    </li>
  );
}

/** Content-Sync: Lauf-Historie statt einer Mail pro Lauf, Mails nur auf Wunsch. */
export default function ContentSyncTab() {
  const [filter, setFilter] = useState<ContentSyncRunFilter>('all');
  const { data: runs, isLoading, isError } = useContentSyncRuns(filter);

  return (
    <>
      <EmailSwitch />

      <div className="flex gap-1 mb-lg">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            aria-pressed={filter === key}
            className={cn(
              'px-3 py-1.5 text-sm font-medium rounded-md border-none cursor-pointer transition-colors',
              filter === key
                ? 'bg-grey-200 dark:bg-grey-700 text-foreground'
                : 'bg-transparent text-grey-500 hover:text-foreground hover:bg-grey-100 dark:hover:bg-grey-800'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-sm">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : isError ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400 py-lg text-center">
          Die Sync-Läufe konnten nicht geladen werden.
        </p>
      ) : !runs || runs.length === 0 ? (
        <p className="text-sm text-grey-500 dark:text-grey-400 py-lg text-center">
          {filter === 'problems' ? 'Keine Probleme in den letzten Läufen.' : 'Noch keine Läufe.'}
        </p>
      ) : (
        <>
          {filter === 'all' && (
            <section className="mb-lg">
              <h3 className="text-sm font-semibold text-foreground mb-xs">
                Letzter Stand je Quelle
              </h3>
              <ul className="p-0 m-0">
                {latestPerTarget(runs).map((run) => (
                  <RunRow key={run.id} run={run} />
                ))}
              </ul>
            </section>
          )}
          <section>
            <h3 className="text-sm font-semibold text-foreground mb-xs">Verlauf</h3>
            <ul className="p-0 m-0">
              {runs.map((run) => (
                <RunRow key={run.id} run={run} />
              ))}
            </ul>
          </section>
        </>
      )}
    </>
  );
}
