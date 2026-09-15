/**
 * EXPERIMENTAL — management surface for recurring agent tasks: list, pause/resume,
 * run-now, edit (in the agent builder) and delete. Creation happens in the agent
 * builder (`/agents/new?mode=recurring`), not here.
 */
import { type RecurringTask } from '@gruenerator/contracts';
import { ConfirmDialogProvider, useConfirm } from '@gruenerator/ui';
import { useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { useDeleteRecurringTask, useRecurringTasks, useUpdateRecurringTask } from './api';
import { RunHistoryDisclosure } from './RunHistory';
import { DELIVERY_LABEL, describeRecurrence } from './scheduleState';
import { useRecurringRunNow } from './useRecurringRunNow';

function TaskRow({ task, highlighted }: { task: RecurringTask; highlighted: boolean }) {
  const update = useUpdateRecurringTask();
  const remove = useDeleteRecurringTask();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const rowRef = useRef<HTMLDivElement | null>(null);

  // Aus der Benachrichtigung oder direkt nach dem Anlegen kommt ?task=<id> —
  // die Zeile muss dann sichtbar UND fokussiert sein, sonst sucht die Person
  // ihre Aufgabe in einer langen Liste.
  useEffect(() => {
    if (!highlighted || !rowRef.current) return;
    rowRef.current.scrollIntoView({ block: 'center' });
    rowRef.current.focus();
  }, [highlighted]);
  const { start: startRun, isBusy } = useRecurringRunNow(task, (url) => void navigate(url));

  return (
    <div
      ref={rowRef}
      tabIndex={-1}
      className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4 ${
        highlighted ? 'border-primary-500' : 'border-border'
      }`}
    >
      <div className="min-w-0">
        <p className="font-medium">{task.title}</p>
        <p className="truncate text-sm text-muted-foreground">{task.instruction}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {describeRecurrence(task.recurrence)} · {DELIVERY_LABEL[task.delivery]} · Nächste:{' '}
          {new Date(task.nextRunAt).toLocaleString('de-DE', {
            dateStyle: 'short',
            timeStyle: 'short',
          })}
          {' · Zuletzt: '}
          {task.lastRunAt
            ? new Date(task.lastRunAt).toLocaleString('de-DE', {
                dateStyle: 'short',
                timeStyle: 'short',
              })
            : 'noch nie'}
        </p>
        {task.pausedReason === 'auto_failures' && (
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
            Nach drei Fehlschlägen in Folge automatisch angehalten. Prüfe die Anweisung und
            aktiviere sie wieder.
          </p>
        )}
        <RunHistoryDisclosure
          taskId={task.id}
          delivery={task.delivery}
          limit={10}
          defaultOpen={highlighted}
        />
      </div>
      <div className="flex items-center gap-2">
        {/* Only agents that resolve as editable user agents (created via the
            builder) get an edit link; chat-created tasks may point at a system
            agent, which isn't editable here. */}
        {task.agentIdentifier && (
          <Link
            to={`/agents/${task.agentIdentifier}/edit`}
            className="rounded border border-border px-3 py-1 text-sm"
          >
            Bearbeiten
          </Link>
        )}
        <button
          onClick={() => update.mutate({ id: task.id, patch: { enabled: !task.enabled } })}
          className="rounded border border-border px-3 py-1 text-sm"
        >
          {task.enabled ? 'Pausieren' : 'Aktivieren'}
        </button>
        <button
          type="button"
          onClick={startRun}
          disabled={isBusy}
          aria-busy={isBusy}
          className="rounded border border-border px-3 py-1 text-sm disabled:opacity-50"
        >
          {isBusy ? 'Läuft …' : 'Jetzt ausführen'}
        </button>
        {/* Toasts erreichen Screenreader nicht verlässlich. */}
        <span role="status" aria-live="polite" className="sr-only">
          {isBusy ? `Lauf „${task.title}" läuft.` : ''}
        </span>
        <button
          onClick={() => {
            void confirm({
              title: 'Wiederkehrende Aufgabe löschen?',
              description: `„${task.title}" wird gelöscht und läuft nicht mehr. Bereits gelieferte Ergebnisse bleiben erhalten.`,
              confirmLabel: 'Löschen',
              variant: 'destructive',
            }).then((ok) => {
              if (ok) remove.mutate(task.id);
            });
          }}
          className="rounded border border-red-300 px-3 py-1 text-sm text-red-500"
        >
          Löschen
        </button>
      </div>
    </div>
  );
}

/**
 * The list management surface without a page header — embedded both by the
 * standalone /wiederkehrend route and the Agentura "Wiederkehrende Aufgaben"
 * category. New tasks are created through the agent builder.
 */
export function RecurringTasksManager() {
  const { data: tasks, isLoading } = useRecurringTasks();
  const [params] = useSearchParams();
  const focusTaskId = params.get('task');

  // `useConfirm` fällt ohne Provider auf `window.confirm` zurück; der Provider
  // hier liefert stattdessen den fokusgeführten AlertDialog.
  return (
    <ConfirmDialogProvider>
      <div className="flex flex-col gap-4">
        {isLoading ? (
          <p className="text-muted-foreground">Lädt…</p>
        ) : !tasks || tasks.length === 0 ? (
          <p className="text-muted-foreground">
            Noch keine wiederkehrenden Aufgaben. Lege über „Neuer wiederkehrender Agent“ eine an
            oder frag im Chat: „Erstelle jeden Montag um 9 Uhr eine Zusammenfassung …“
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {tasks.map((task) => (
              <TaskRow key={task.id} task={task} highlighted={task.id === focusTaskId} />
            ))}
          </div>
        )}
      </div>
    </ConfirmDialogProvider>
  );
}

export default function RecurringTasksPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
      <div>
        <h1 className="text-2xl font-semibold">Wiederkehrende Aufgaben</h1>
        <p className="text-sm text-muted-foreground">
          Lass eine*n Agent*in regelmäßig automatisch arbeiten (experimentell).
        </p>
      </div>
      <RecurringTasksManager />
    </div>
  );
}
