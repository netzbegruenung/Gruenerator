/**
 * Market card for a recurring agent task — mirrors {@link MarketCard}'s look so the
 * "Wiederkehrende Aufgaben" sub-section of the "Meine Grüneratoren" aisle reads as
 * one grid with the agent cards. Actions (pause/resume, run-now, edit, delete)
 * reuse the recurring-task hooks; creation still happens in the agent builder.
 */
import { type RecurringTask } from '@gruenerator/contracts';
import { PiPause, PiPencilSimple, PiPlay, PiRepeat, PiTrash } from 'react-icons/pi';
import { Link } from 'react-router-dom';

import {
  useDeleteRecurringTask,
  useRunRecurringTaskNow,
  useUpdateRecurringTask,
} from '../../recurring-tasks/api';
import { DELIVERY_LABEL, describeRecurrence } from '../../recurring-tasks/scheduleState';

const ICON_BTN = 'rounded-md p-2 text-secondary-600 transition-colors hover:bg-secondary-600/10';

export function RecurringTaskCard({ task }: { task: RecurringTask }) {
  const update = useUpdateRecurringTask();
  const remove = useDeleteRecurringTask();
  const runNow = useRunRecurringTaskNow();

  const nextRun = new Date(task.nextRunAt).toLocaleString('de-DE', {
    dateStyle: 'short',
    timeStyle: 'short',
  });

  return (
    <div className="group flex flex-col gap-sm rounded-lg border border-grey-200 bg-card p-md shadow-xs transition-all duration-300 ease-out hover:border-secondary-600/40 hover:shadow-md dark:border-grey-700">
      <div className="flex items-start gap-sm">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-secondary-600/10 text-2xl text-secondary-600">
          <PiRepeat />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-xs">
            <h3 className="m-0 text-base font-semibold leading-tight text-foreground-heading">
              {task.title}
            </h3>
            {!task.enabled && (
              <span className="rounded-full bg-hover-alt px-2 py-0.5 text-xs font-medium text-foreground-muted">
                Pausiert
              </span>
            )}
          </div>
          <p className="m-0 mt-xs line-clamp-2 text-sm leading-relaxed text-foreground">
            {task.instruction}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          {task.agentIdentifier && (
            <Link
              to={`/agents/${task.agentIdentifier}/edit`}
              aria-label="Bearbeiten"
              className={ICON_BTN}
            >
              <PiPencilSimple className="h-4 w-4" />
            </Link>
          )}
          <button
            type="button"
            aria-label="Löschen"
            onClick={() => {
              if (window.confirm(`Aufgabe „${task.title}" wirklich löschen?`))
                remove.mutate(task.id);
            }}
            className="rounded-md p-2 text-red-600 transition-colors hover:bg-red-600/10"
          >
            <PiTrash className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="border-t border-grey-100 pt-sm dark:border-grey-800">
        <p className="m-0 mb-sm text-xs text-foreground-muted">
          {describeRecurrence(task.recurrence)} · {DELIVERY_LABEL[task.delivery]} · Nächste:{' '}
          {nextRun}
        </p>
        <div className="flex flex-wrap gap-xs">
          <button
            type="button"
            onClick={() => update.mutate({ id: task.id, patch: { enabled: !task.enabled } })}
            className="inline-flex items-center gap-xs rounded-md border border-grey-200 px-sm py-1 text-xs font-medium text-foreground transition-colors hover:bg-hover-alt dark:border-grey-700"
          >
            {task.enabled ? (
              <PiPause className="h-3.5 w-3.5" />
            ) : (
              <PiPlay className="h-3.5 w-3.5" />
            )}
            {task.enabled ? 'Pausieren' : 'Aktivieren'}
          </button>
          <button
            type="button"
            onClick={() => runNow.mutate(task.id)}
            disabled={runNow.isPending}
            className="inline-flex items-center gap-xs rounded-md border border-grey-200 px-sm py-1 text-xs font-medium text-foreground transition-colors hover:bg-hover-alt disabled:opacity-50 dark:border-grey-700"
          >
            <PiPlay className="h-3.5 w-3.5" />
            Jetzt ausführen
          </button>
        </div>
      </div>
    </div>
  );
}
