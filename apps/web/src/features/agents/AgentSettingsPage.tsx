import { useParams } from 'react-router-dom';

import AgentEditor from './AgentEditor';
import { hydrateFormState } from './agentFormState';
import { useUserAgent } from './api';

import PageContainer from '@/components/common/PageContainer';
import { useDocumentTitle } from '@/components/hooks/useDocumentTitle';

/**
 * Edit route (`/agents/:identifier/edit`): loads the agent and hands it to the
 * shared single-page {@link AgentEditor} in edit mode. The same editor backs the
 * create routes, so create and edit look and behave identically.
 */
function AgentSettingsPage() {
  const { identifier } = useParams<{ identifier: string }>();
  const { data: agent, isLoading } = useUserAgent(identifier);

  useDocumentTitle(agent ? `${agent.title} bearbeiten` : 'Agent bearbeiten');

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

  return (
    <AgentEditor
      // Remount on identifier change so the form re-seeds from the loaded agent.
      key={agent.identifier}
      mode="edit"
      identifier={agent.identifier}
      initialState={hydrateFormState(agent)}
    />
  );
}

export default AgentSettingsPage;
