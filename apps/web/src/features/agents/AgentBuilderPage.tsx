import AgentBuilderForm from './AgentBuilderForm';

import PageContainer from '@/components/common/PageContainer';
import { useDocumentTitle } from '@/components/hooks/useDocumentTitle';

/**
 * Route wrapper for the manual create entry point (`/agents/new/manual`). The
 * AI-assisted create renders {@link AgentBuilderForm} from the start-screen
 * orchestrator; editing uses {@link AgentSettingsPage}.
 */
function AgentBuilderPage() {
  useDocumentTitle('Neuer Agent');

  return (
    <PageContainer maxWidth="md" title="Neuer Agent">
      <div className="mx-auto max-w-3xl">
        <AgentBuilderForm />
      </div>
    </PageContainer>
  );
}

export default AgentBuilderPage;
