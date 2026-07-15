import { useParams } from 'react-router-dom';

import { useRecurringTasks } from '../recurring-tasks/api';
import { recurrenceToSchedule } from '../recurring-tasks/scheduleState';

import AgentEditor from './AgentEditor';
import { hydrateFormState } from './agentFormState';
import { useUserAgent } from './api';

import PageContainer from '@/components/common/PageContainer';
import { useDocumentTitle } from '@/components/hooks/useDocumentTitle';

/**
 * Edit route (`/agents/:identifier/edit`): loads the agent and hands it to the
 * shared single-page {@link AgentEditor} in edit mode. The same editor backs the
 * create routes, so create and edit look and behave identically. If the agent has
 * a recurring task, its schedule is loaded too so the Zeitplan tab is editable.
 */
function AgentSettingsPage() {
  const { identifier } = useParams<{ identifier: string }>();
  const { data: agent, isLoading } = useUserAgent(identifier);
  const { data: recurringTasks = [], isLoading: tasksLoading } = useRecurringTasks();

  useDocumentTitle(agent ? `${agent.title} bearbeiten` : 'Agent bearbeiten');

  // Only the agent gates the editor render — the recurring-task lookup must not
  // block editing a plain agent.
  if (isLoading) {
    return (
      <PageContainer maxWidth="md">
        <p className="text-foreground-muted">Lädt…</p>
      </PageContainer>
    );
  }
  if (!agent) {
    return (
      <PageContainer maxWidth="md">
        <p>Agent nicht gefunden.</p>
      </PageContainer>
    );
  }

  // A recurring agent has exactly one task (the builder creates them 1:1); take
  // the first match. Undefined while the list is still loading.
  const task = tasksLoading
    ? undefined
    : recurringTasks.find((t) => t.agentIdentifier === agent.identifier);

  return (
    <AgentEditor
      // Remount on identifier change, and once the task list resolves, so the
      // schedule seeds without blocking the editor on that fetch.
      key={`${agent.identifier}:${tasksLoading ? 'pending' : 'ready'}`}
      mode="edit"
      identifier={agent.identifier}
      initialState={hydrateFormState(agent)}
      initialSchedule={task ? recurrenceToSchedule(task) : null}
      recurringTaskId={task?.id}
    />
  );
}

export default AgentSettingsPage;
