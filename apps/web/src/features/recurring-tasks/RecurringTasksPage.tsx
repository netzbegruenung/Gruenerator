/**
 * EXPERIMENTAL — management surface for recurring agent tasks. Create, list,
 * pause/resume, run-now and delete. Kept dependency-light on purpose (experimental).
 */
import {
  type RecurringTask,
  type RecurringTaskDelivery,
  type ScheduleRecurrence,
} from '@gruenerator/contracts';
import { useState } from 'react';

import {
  useCreateRecurringTask,
  useDeleteRecurringTask,
  useRecurringTasks,
  useRunRecurringTaskNow,
  useUpdateRecurringTask,
} from './api';

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const DELIVERY_LABEL: Record<RecurringTaskDelivery, string> = {
  document: 'Dokument',
  summary: 'Zusammenfassung',
  thread: 'Chat',
};

function describeRecurrence(rec: ScheduleRecurrence): string {
  const time = `${String(rec.hour).padStart(2, '0')}:${String(rec.minute).padStart(2, '0')}`;
  if (rec.frequency === 'daily') return `Täglich, ${time}`;
  if (rec.frequency === 'weekly') {
    const days = (rec.byweekday ?? []).map((d) => WEEKDAYS[d]).join(', ');
    return days ? `Wöchentlich (${days}), ${time}` : `Wöchentlich, ${time}`;
  }
  return rec.bymonthday ? `Monatlich am ${rec.bymonthday}., ${time}` : `Monatlich, ${time}`;
}

function CreateForm({ onDone }: { onDone: () => void }) {
  const create = useCreateRecurringTask();
  const [title, setTitle] = useState('');
  const [instruction, setInstruction] = useState('');
  const [frequency, setFrequency] = useState<ScheduleRecurrence['frequency']>('weekly');
  const [time, setTime] = useState('09:00');
  const [weekday, setWeekday] = useState(0);
  const [delivery, setDelivery] = useState<RecurringTaskDelivery>('document');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const [h, m] = time.split(':').map((n) => parseInt(n, 10));
    const recurrence: ScheduleRecurrence = {
      frequency,
      hour: Number.isFinite(h) ? h : 9,
      minute: Number.isFinite(m) ? m : 0,
      ...(frequency === 'weekly' ? { byweekday: [weekday] } : {}),
    };
    create.mutate(
      {
        title,
        instruction,
        recurrence,
        delivery,
        timezone: 'Europe/Berlin',
        locale: 'de-DE',
        enabled: true,
      },
      { onSuccess: onDone }
    );
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <input
        className="rounded border border-border bg-background px-3 py-2"
        placeholder="Titel (z. B. Wöchentlicher Klima-Überblick)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
      />
      <textarea
        className="min-h-[80px] rounded border border-border bg-background px-3 py-2"
        placeholder="Was soll der Agent regelmäßig tun?"
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        required
      />
      <div className="flex flex-wrap gap-3">
        <select
          className="rounded border border-border bg-background px-3 py-2"
          value={frequency}
          onChange={(e) => setFrequency(e.target.value as ScheduleRecurrence['frequency'])}
        >
          <option value="daily">Täglich</option>
          <option value="weekly">Wöchentlich</option>
          <option value="monthly">Monatlich</option>
        </select>
        {frequency === 'weekly' && (
          <select
            className="rounded border border-border bg-background px-3 py-2"
            value={weekday}
            onChange={(e) => setWeekday(parseInt(e.target.value, 10))}
          >
            {WEEKDAYS.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
        )}
        <input
          type="time"
          className="rounded border border-border bg-background px-3 py-2"
          value={time}
          onChange={(e) => setTime(e.target.value)}
        />
        <select
          className="rounded border border-border bg-background px-3 py-2"
          value={delivery}
          onChange={(e) => setDelivery(e.target.value as RecurringTaskDelivery)}
        >
          <option value="document">Als Dokument</option>
          <option value="summary">Als Zusammenfassung</option>
          <option value="thread">Als Chat</option>
        </select>
      </div>
      {create.isError && <p className="text-sm text-red-500">{(create.error as Error).message}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={create.isPending}
          className="rounded bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
        >
          {create.isPending ? 'Erstelle…' : 'Aufgabe erstellen'}
        </button>
        <button type="button" onClick={onDone} className="rounded border border-border px-4 py-2">
          Abbrechen
        </button>
      </div>
    </form>
  );
}

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

export default function RecurringTasksPage() {
  const { data: tasks, isLoading } = useRecurringTasks();
  const [creating, setCreating] = useState(false);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Wiederkehrende Aufgaben</h1>
          <p className="text-sm text-muted-foreground">
            Lass eine*n Agent*in regelmäßig automatisch arbeiten (experimentell).
          </p>
        </div>
        {!creating && (
          <button
            onClick={() => setCreating(true)}
            className="rounded bg-primary px-4 py-2 text-primary-foreground"
          >
            Neue Aufgabe
          </button>
        )}
      </div>

      {creating && <CreateForm onDone={() => setCreating(false)} />}

      {isLoading ? (
        <p className="text-muted-foreground">Lädt…</p>
      ) : !tasks || tasks.length === 0 ? (
        <p className="text-muted-foreground">
          Noch keine wiederkehrenden Aufgaben. Erstelle eine oder frag im Chat: „Erstelle jeden
          Montag um 9 Uhr eine Zusammenfassung …“
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
