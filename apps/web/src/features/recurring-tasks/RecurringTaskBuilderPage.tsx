/**
 * Eigener Editor für wiederkehrende Aufgaben (#5939): Titel, Anweisung, Takt,
 * Lieferung und optional ein Projekt — ohne Agent. `/wiederkehrend/neu` legt an
 * (`?projekt=<id>` wählt das Projekt vor), `/wiederkehrend/:id/bearbeiten` ändert.
 * Aufgaben mit Agent (Altbestand) bearbeitet weiter der Agent-Editor.
 */
import { MAX_RECURRING_TASK_INSTRUCTION } from '@gruenerator/contracts';
import {
  DEFAULT_SCHEDULE,
  recurrenceToSchedule,
  scheduleToRecurrence,
  useMyGroupsForSharing,
  type ScheduleState,
} from '@gruenerator/shared/grueneratoren';
import { Button, Input, Textarea } from '@gruenerator/ui';
import { useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { useCreateRecurringTask, useRecurringTasks, useUpdateRecurringTask } from './api';
import { RecurrenceFields } from './RecurrenceFields';

import withAuthRequired from '@/components/common/LoginRequired/withAuthRequired';
import PageContainer from '@/components/common/PageContainer';
import { useDocumentTitle } from '@/components/hooks/useDocumentTitle';
import { useAuthStore } from '@/stores/authStore';

const selectCls =
  'h-11 w-full rounded-sm border-0 bg-input-bg px-sm text-sm text-input-text outline-none transition-all focus-visible:ring-[3px] focus-visible:ring-ring/50';
const labelCls = 'flex flex-col gap-xs text-sm font-medium';

interface InitialValues {
  title: string;
  instruction: string;
  groupId: string;
  schedule: ScheduleState;
}

function Builder({
  taskId,
  initial,
  locale,
}: {
  taskId: string | null;
  initial: InitialValues;
  locale: string;
}) {
  const navigate = useNavigate();
  const createMut = useCreateRecurringTask();
  const updateMut = useUpdateRecurringTask();
  const { data: projects = [] } = useMyGroupsForSharing(true);
  const [title, setTitle] = useState(initial.title);
  const [instruction, setInstruction] = useState(initial.instruction);
  const [groupId, setGroupId] = useState(initial.groupId);
  const [schedule, setSchedule] = useState(initial.schedule);
  const [error, setError] = useState<string | null>(null);
  const saving = createMut.isPending || updateMut.isPending;
  const canSave = title.trim().length > 0 && instruction.trim().length > 0 && !saving;

  const handleSave = async () => {
    setError(null);
    const base = {
      title: title.trim(),
      instruction: instruction.trim(),
      recurrence: scheduleToRecurrence(schedule),
      delivery: schedule.delivery,
      emailNotify: schedule.emailNotify,
      timezone: schedule.timezone,
      groupId: groupId || null,
    };
    try {
      if (taskId) {
        await updateMut.mutateAsync({ id: taskId, patch: base });
        void navigate(`/wiederkehrend?task=${taskId}`);
      } else {
        const created = await createMut.mutateAsync({
          ...base,
          agentIdentifier: null,
          locale,
          enabled: true,
        });
        void navigate(`/wiederkehrend?task=${created.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.');
    }
  };

  return (
    <PageContainer maxWidth="md">
      <h1 className="mb-lg text-xl font-bold tracking-tight text-foreground-heading">
        {taskId ? 'Aufgabe bearbeiten' : 'Neue wiederkehrende Aufgabe'}
      </h1>
      {error && (
        <p role="alert" className="mb-md text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-col gap-lg">
        <label className={labelCls}>
          Titel
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder="z. B. Wochenüberblick Kommunalpolitik"
          />
        </label>
        <label className={labelCls}>
          Anweisung
          <Textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            maxLength={MAX_RECURRING_TASK_INSTRUCTION}
            rows={8}
            placeholder="Was soll der Grünerator bei jedem Lauf tun?"
          />
        </label>
        <label className={labelCls}>
          Projekt (optional)
          <select
            className={selectCls}
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
          >
            <option value="">Kein Projekt</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <span className="text-xs font-normal text-foreground-muted">
            Mit Projekt gelten dessen Anweisungen, Dateien, Notebooks und Rezepte im Lauf, und ein
            Ergebnis im Chat landet im Projekt.
          </span>
        </label>
        <RecurrenceFields value={schedule} onChange={setSchedule} />
        <div className="flex gap-sm">
          <Button
            variant="brand"
            size="brand-sm"
            onClick={() => void handleSave()}
            disabled={!canSave}
          >
            Speichern
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void navigate('/wiederkehrend')}
            disabled={saving}
          >
            Abbrechen
          </Button>
        </div>
      </div>
    </PageContainer>
  );
}

function RecurringTaskBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const locale = useAuthStore((s) => s.locale);
  const { data: tasks, isLoading } = useRecurringTasks();
  useDocumentTitle(id ? 'Aufgabe bearbeiten' : 'Neue wiederkehrende Aufgabe');

  if (!id) {
    return (
      <Builder
        taskId={null}
        locale={locale}
        initial={{
          title: '',
          instruction: '',
          groupId: params.get('projekt') ?? '',
          schedule: {
            ...DEFAULT_SCHEDULE,
            timezone: locale === 'de-AT' ? 'Europe/Vienna' : DEFAULT_SCHEDULE.timezone,
          },
        }}
      />
    );
  }

  if (isLoading) return <p className="p-4 text-muted-foreground">Lädt…</p>;
  const task = tasks?.find((t) => t.id === id);
  if (!task) return <Navigate to="/wiederkehrend" replace />;
  // Altbestand mit Agent: die Anweisung ist dort die Anleitung des Agents.
  if (task.agentIdentifier) return <Navigate to={`/agents/${task.agentIdentifier}/edit`} replace />;
  return (
    <Builder
      taskId={task.id}
      locale={task.locale}
      initial={{
        title: task.title,
        instruction: task.instruction,
        groupId: task.groupId ?? '',
        schedule: recurrenceToSchedule(task),
      }}
    />
  );
}

export default withAuthRequired(RecurringTaskBuilderPage, {
  title: 'Wiederkehrende Aufgabe',
  fallback: <div className="flex min-h-0 flex-1 bg-background" />,
});
