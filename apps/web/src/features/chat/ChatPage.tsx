import {
  ChatOverview,
  type NotebookLink,
  GrueneratorThread,
  useAgentStore,
} from '@gruenerator/chat';
import { useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import withAuthRequired from '@/components/common/LoginRequired/withAuthRequired';
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
  const firstName = useFirstName();

  const handleNavigate = useCallback((path: string) => navigate(path), [navigate]);

  const handleSelectNotebook = useCallback((notebookId: string) => {
    const store = useAgentStore.getState();
    store.setThreadMode('notebook');
    store.setSelectedNotebook(notebookId);
    store.setChatViewMode('thread');
  }, []);

  const agentParam = searchParams.get('agent');
  const modeParam = searchParams.get('mode');
  const store = useAgentStore.getState();
  if (agentParam && store.selectedAgentId !== agentParam) {
    store.setSelectedAgent(agentParam);
    store.setChatViewMode('thread');
  }
  if (
    modeParam &&
    (modeParam === 'search' || modeParam === 'notebook' || modeParam === 'eigener') &&
    store.threadMode !== modeParam
  ) {
    store.setThreadMode(modeParam);
    store.setChatViewMode('thread');
  }

  return (
    <div className="chat-page-root flex min-h-0 bg-background">
      <main className="flex min-h-0 flex-1 flex-col pt-4 md:pt-0">
        {chatViewMode === 'overview' ? (
          <ChatOverview
            firstName={firstName}
            notebooks={notebookLinks}
            onNavigate={handleNavigate}
            onSelectNotebook={handleSelectNotebook}
          />
        ) : (
          <GrueneratorThread onNavigate={handleNavigate} firstName={firstName} />
        )}
      </main>
    </div>
  );
}

export default withAuthRequired(ChatPage, {
  title: 'Chat',
  fallback: <div className="flex min-h-0 flex-1 bg-background" />,
});
