import {
  ChatOverview,
  type NotebookLink,
  GrueneratorThread,
  useAgentStore,
  type UserRole,
} from '@gruenerator/chat';
import { useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import withAuthRequired from '@/components/common/LoginRequired/withAuthRequired';
import { useDocumentTitle } from '@/components/hooks/useDocumentTitle';
import { SYSTEM_NOTEBOOKS } from '@/features/notebook/config/notebooksConfig';
import { useFirstName } from '@/hooks/useFirstName';

const notebookLinks: NotebookLink[] = SYSTEM_NOTEBOOKS.map((nb) => ({
  id: nb.id,
  path: nb.path,
  title: nb.title.replace(/^Frag\s+/i, ''),
}));

function ChatPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const chatViewMode = useAgentStore((s) => s.chatViewMode);
  const currentThreadTitle = useAgentStore((s) => s.currentThreadTitle);
  const firstName = useFirstName();
  const agentParam = searchParams.get('agent');
  const modeParam = searchParams.get('mode');

  // When the URL carries an agent or mode param, jump straight into the thread —
  // otherwise users land on the overview/role-picker first and have no idea
  // their click on a sidebar agent entry "did anything".
  const effectiveViewMode =
    agentParam ||
    (modeParam && (modeParam === 'search' || modeParam === 'notebook' || modeParam === 'eigener'))
      ? 'thread'
      : chatViewMode;

  useDocumentTitle(effectiveViewMode === 'thread' ? currentThreadTitle : null);

  useEffect(() => {
    const store = useAgentStore.getState();
    if (agentParam) {
      if (store.selectedAgentId !== agentParam) {
        store.setSelectedAgent(agentParam);
        store.setChatViewMode('thread');
      }
    } else if (store.selectedAgentId !== null) {
      store.setSelectedAgent(null);
    }
    if (
      modeParam &&
      (modeParam === 'search' || modeParam === 'notebook' || modeParam === 'eigener') &&
      store.threadMode !== modeParam
    ) {
      store.setThreadMode(modeParam);
      store.setChatViewMode('thread');
    }
  }, [agentParam, modeParam]);

  const handleNavigate = useCallback((path: string) => navigate(path), [navigate]);

  const handleSelectNotebook = useCallback((notebookId: string) => {
    const store = useAgentStore.getState();
    store.setThreadMode('notebook');
    store.setSelectedNotebook(notebookId);
    store.setChatViewMode('thread');
  }, []);

  const handleSelectRole = useCallback((role: UserRole) => {
    const store = useAgentStore.getState();
    if (role.systemPrompt) {
      store.setCustomSystemPrompt(role.systemPrompt);
    }
    store.setCustomRoleName(role.rolle);
    store.setThreadMode('eigener');
    store.setChatViewMode('thread');
  }, []);

  return (
    <div className="flex min-h-0 h-full bg-background">
      <main className="flex min-h-0 flex-1 flex-col pt-4 md:pt-0">
        {effectiveViewMode === 'overview' ? (
          <ChatOverview
            firstName={firstName}
            notebooks={notebookLinks}
            onNavigate={handleNavigate}
            onSelectNotebook={handleSelectNotebook}
            onSelectRole={handleSelectRole}
            requireProfileHydration
          />
        ) : (
          <GrueneratorThread
            onNavigate={handleNavigate}
            firstName={firstName}
            requireProfileHydration
          />
        )}
      </main>
    </div>
  );
}

export default withAuthRequired(ChatPage, {
  title: 'Chat',
  fallback: <div className="flex min-h-0 flex-1 bg-background" />,
});
