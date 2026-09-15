/**
 * Verlauf einer wiederkehrenden Aufgabe — was der Agent tat, während niemand
 * zusah.
 *
 * Alles hier wurde schon immer von `GET /api/recurring-tasks/:id/runs`
 * ausgeliefert und nirgends gezeigt (#3221): der Hook `useRecurringTaskRuns`
 * hatte null Aufrufer. Zwei Anzeigeregeln tragen den Rest der Datei:
 *
 * - Ein LEERER Lauf ist kein Fehler. „Nur bei Neuem" kann die Absicht sein,
 *   deshalb gedämpft und ohne Warnfarbe.
 * - Das Verdikt ist ein MESSWERT, kein Gate. Ein beanstandeter Lauf wurde
 *   trotzdem zugestellt (es wartet niemand, der nachbessern könnte), also darf
 *   der Hinweis nie wie ein Fehler aussehen — und ein zufriedenes Verdikt
 *   bleibt unsichtbar, weil ein grünes Häkchen sein Fehlen wie einen Mangel
 *   erscheinen ließe.
 */
import { type RecurringTaskDelivery, type RecurringTaskRun } from '@gruenerator/contracts';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@gruenerator/ui';
import { FiChevronDown } from 'react-icons/fi';

import { useRecurringTaskRuns } from './api';

const STATUS_META: Record<RecurringTaskRun['status'], { label: string; className: string }> = {
  completed: { label: 'Erledigt', className: 'text-green-600 dark:text-green-400' },
  empty: { label: 'Nichts Neues', className: 'text-grey-500' },
  failed: { label: 'Fehlgeschlagen', className: 'text-red-600 dark:text-red-400' },
};

/** `summary` liefert keinen Ort — der Text selbst ist das Ergebnis. */
function resultLinkLabel(delivery: RecurringTaskDelivery): string | null {
  if (delivery === 'document') return 'Dokument öffnen';
  if (delivery === 'thread') return 'Chat öffnen';
  return null;
}

function formatDuration(ms: number | null): string | null {
  if (ms == null) return null;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} s`;
  return `${Math.floor(seconds / 60)} min`;
}

function VerdictNote({ verdict }: { verdict: NonNullable<RecurringTaskRun['verdict']> }) {
  const suffix = verdict.repaired === true ? ' — nachgebessert' : '';
  const shipped = verdict.repaired === false ? ' — Erstfassung zugestellt' : '';
  return (
    <p className="mt-0.5 text-[11px] text-amber-600 dark:text-amber-400">
      <span className="sr-only">
        Hinweis der Selbstprüfung. Das Ergebnis wurde trotzdem zugestellt.{' '}
      </span>
      Selbstprüfung: {verdict.hint ?? 'Das Ergebnis passt möglicherweise nicht zur Anweisung.'}
      {suffix}
      {shipped}
    </p>
  );
}

function RunRow({ run, delivery }: { run: RecurringTaskRun; delivery: RecurringTaskDelivery }) {
  const meta = STATUS_META[run.status];
  const duration = formatDuration(run.durationMs);
  const linkLabel = resultLinkLabel(delivery);

  return (
    <li className="border-b border-grey-100 py-1.5 last:border-b-0 dark:border-grey-800">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <span className="text-[11px] text-grey-500">
          {new Date(run.createdAt).toLocaleString('de-DE', {
            dateStyle: 'short',
            timeStyle: 'short',
          })}
          {duration != null && ` · ${duration}`}
        </span>
        <span className={`text-[11px] font-medium ${meta.className}`}>{meta.label}</span>
      </div>

      {run.status === 'completed' && run.resultUrl != null && linkLabel != null && (
        <a
          href={run.resultUrl}
          className="text-[11px] text-primary-600 underline dark:text-primary-400"
        >
          {linkLabel}
        </a>
      )}

      {run.status === 'completed' && run.resultUrl == null && run.resultsSummary != null && (
        <p className="mt-0.5 text-[11px] text-foreground">{run.resultsSummary}</p>
      )}

      {run.status === 'empty' && (
        <p className="mt-0.5 text-[11px] text-grey-500">
          Der Lauf hat nichts ergeben — es wurde nichts zugestellt.
        </p>
      )}

      {run.status === 'failed' && run.error != null && (
        <p className="mt-0.5 line-clamp-2 text-[11px] text-grey-500" title={run.error}>
          {run.error}
        </p>
      )}

      {run.verdict != null && !run.verdict.ok && <VerdictNote verdict={run.verdict} />}
    </li>
  );
}

export interface RunHistoryProps {
  taskId: string;
  /** Bestimmt das Link-Label des Ergebnisses; der Lauf selbst kennt es nicht. */
  delivery: RecurringTaskDelivery;
  limit?: number;
}

export function RunHistory({ taskId, delivery, limit = 5 }: RunHistoryProps) {
  const { data, isLoading, isError } = useRecurringTaskRuns(taskId);

  if (isLoading) return <p className="text-[11px] text-grey-500">Verlauf lädt…</p>;
  if (isError) return <p className="text-[11px] text-grey-500">Verlauf nicht verfügbar.</p>;

  const runs = (data ?? []).slice(0, limit);
  if (runs.length === 0) {
    return <p className="text-[11px] text-grey-500">Noch kein Lauf.</p>;
  }

  return (
    <ul className="mt-1">
      {runs.map((run) => (
        <RunRow key={run.id} run={run} delivery={delivery} />
      ))}
    </ul>
  );
}

/** Aufklappbarer Verlauf für die kompakten Listenzeilen. */
export function RunHistoryDisclosure({
  taskId,
  delivery,
  limit,
  defaultOpen = false,
}: RunHistoryProps & { defaultOpen?: boolean }) {
  return (
    <Collapsible defaultOpen={defaultOpen} className="mt-2">
      <CollapsibleTrigger className="flex items-center gap-1 text-xs text-grey-500 hover:text-foreground">
        <FiChevronDown size={12} aria-hidden="true" />
        Verlauf
      </CollapsibleTrigger>
      <CollapsibleContent>
        <RunHistory taskId={taskId} delivery={delivery} limit={limit} />
      </CollapsibleContent>
    </Collapsible>
  );
}
