/**
 * EXPERIMENTAL — management surface for recurring agent tasks: list, pause/resume,
 * run-now, edit (in the agent builder) and delete. Creation happens in the agent
 * builder (`/agents/new?mode=recurring`), not here.
 */
import { type RecurringTask } from '@gruenerator/contracts';
import { Link } from 'react-router-dom';

import {
  useDeleteRecurringTask,
  useRecurringTasks,
  useRunRecurringTaskNow,
  useUpdateRecurringTask,
} from './api';
import { DELIVERY_LABEL, describeRecurrence } from './scheduleState';

function TaskRow({ task }: { task: RecurringTask }) {
  const update = useUpdateRecurringTask();
  const remove = useDeleteRecurringTask();
  const runNow = useRunRecurringTaskNow();

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4">
      <div className="min-w-0">
        <p className="font-medium">{task.title}</p>
        <p className="truncate text-sm text-muted-foreground">{task.instruction}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {describeRecurrence(task.recurrence)} · {DELIVERY_LABEL[task.delivery]} · Nächste:{' '}
          {new Date(task.nextRunAt).toLocaleString('de-DE', {
            dateStyle: 'short',
            timeStyle: 'short',
          })}
        </p>
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
          onClick={() => runNow.mutate(task.id)}
          disabled={runNow.isPending}
          className="rounded border border-border px-3 py-1 text-sm disabled:opacity-50"
        >
          Jetzt ausführen
        </button>
        <button
          onClick={() => {
            if (window.confirm(`Aufgabe „${task.title}" wirklich löschen?`)) remove.mutate(task.id);
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

  return (
    <div className="flex flex-col gap-4">
      {isLoading ? (
        <p className="text-muted-foreground">Lädt…</p>
      ) : !tasks || tasks.length === 0 ? (
        <p className="text-muted-foreground">
          Noch keine wiederkehrenden Aufgaben. Lege über „Neuer wiederkehrender Agent“ eine an oder
          frag im Chat: „Erstelle jeden Montag um 9 Uhr eine Zusammenfassung …“
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
        </div>
      )}
    </div>
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
