import AgentEditor from './AgentEditor';
import { EMPTY_FORM } from './agentFormState';

import { useDocumentTitle } from '@/components/hooks/useDocumentTitle';

/**
 * Route wrapper for the manual create entry point (`/agents/new/manual`). Opens
 * the single-page {@link AgentEditor} with an empty form. The AI-assisted create
 * renders the same editor pre-filled from the start screen; editing reuses it too.
 */
function AgentBuilderPage() {
  useDocumentTitle('Neuer Agent');

  return <AgentEditor mode="create" initialState={EMPTY_FORM} />;
}

export default AgentBuilderPage;
