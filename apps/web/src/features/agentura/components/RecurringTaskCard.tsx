/**
 * Market card for a recurring agent task — mirrors {@link MarketCard}'s look so the
 * "Wiederkehrende Aufgaben" sub-section of the "Meine Grüneratoren" aisle reads as
 * one grid with the agent cards. Actions (pause/resume, run-now, edit, delete)
 * reuse the recurring-task hooks; creation still happens in the agent builder.
 */
import { type RecurringTask } from '@gruenerator/contracts';
import { PiPause, PiPencilSimple, PiPlay, PiRepeat, PiTrash } from 'react-icons/pi';
import { Link, useNavigate } from 'react-router-dom';

import { useDeleteRecurringTask, useUpdateRecurringTask } from '../../recurring-tasks/api';
import { RunHistoryDisclosure } from '../../recurring-tasks/RunHistory';
import { DELIVERY_LABEL, describeRecurrence } from '../../recurring-tasks/scheduleState';
import { useRecurringRunNow } from '../../recurring-tasks/useRecurringRunNow';

/** Grau wie {@link MarketCard} — die Kachel steht in derselben Rasterzeile. */
const ICON_BTN = 'rounded-md p-2 text-foreground-muted transition-colors hover:bg-hover-alt';

export function RecurringTaskCard({ task }: { task: RecurringTask }) {
  const update = useUpdateRecurringTask();
  const remove = useDeleteRecurringTask();
  const navigate = useNavigate();
  const { start: startRun, isBusy } = useRecurringRunNow(task, (url) => void navigate(url));

  const nextRun = new Date(task.nextRunAt).toLocaleString('de-DE', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
  const lastRun = task.lastRunAt
    ? new Date(task.lastRunAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
    : 'noch nie';

  return (
    <div className="group flex flex-col gap-sm rounded-lg border border-grey-200 bg-card p-md shadow-xs transition-all duration-300 ease-out hover:border-grey-300 hover:shadow-md dark:border-grey-700 dark:hover:border-grey-600">
      <div className="flex items-start gap-sm">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-grey-100 text-2xl text-foreground-heading dark:bg-grey-800">
          <PiRepeat />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-xs">
            <h3 className="m-0 text-base font-semibold leading-tight text-foreground-heading">
              {task.title}
            </h3>
            {!task.enabled && (
              <span className="rounded-full bg-hover-alt px-2 py-0.5 text-xs font-medium text-foreground-muted">
                {/* „Automatisch" ist der Unterschied zwischen „ich habe sie
                    angehalten" und „sie hat aufgegeben". */}
                {task.pausedReason === 'auto_failures' ? 'Automatisch pausiert' : 'Pausiert'}
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
          {nextRun} · Zuletzt: {lastRun}
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
            onClick={startRun}
            disabled={isBusy}
            aria-busy={isBusy}
            className="inline-flex items-center gap-xs rounded-md border border-grey-200 px-sm py-1 text-xs font-medium text-foreground transition-colors hover:bg-hover-alt disabled:opacity-50 dark:border-grey-700"
          >
            <PiPlay className="h-3.5 w-3.5" />
            {isBusy ? 'Läuft …' : 'Jetzt ausführen'}
          </button>
          {/* Toasts erreichen Screenreader nicht verlässlich. */}
          <span role="status" aria-live="polite" className="sr-only">
            {isBusy ? `Lauf „${task.title}" läuft.` : ''}
          </span>
        </div>
        <RunHistoryDisclosure taskId={task.id} delivery={task.delivery} limit={3} />
      </div>
    </div>
  );
}
