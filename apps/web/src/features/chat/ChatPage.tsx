import {
  ChatOverview,
  type NotebookLink,
  GrueneratorThread,
  useAgentStore,
  useUserProfileStore,
  type UserRole,
} from '@gruenerator/chat';
import { useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { useAuthStore } from '../../stores/authStore';
import { useUserDefaultsStore } from '../../stores/userDefaultsStore';

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
  const locale = useAuthStore((s) => s.locale);
  const getDefault = useUserDefaultsStore((s) => s.getDefault);

  // Hydrate the chat package's userProfileStore with roles from user defaults
  useEffect(() => {
    const roles = getDefault<UserRole[]>('profile', 'roles') || [];
    useUserProfileStore.getState().hydrate({ roles, locale: locale || 'de-DE' });
  }, [getDefault, locale]);

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
    store.setThreadMode('eigener');
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
    <div className="flex min-h-0 h-full bg-background">
      <main className="flex min-h-0 flex-1 flex-col pt-4 md:pt-0">
        {chatViewMode === 'overview' ? (
          <ChatOverview
            firstName={firstName}
            notebooks={notebookLinks}
            onNavigate={handleNavigate}
            onSelectNotebook={handleSelectNotebook}
            onSelectRole={handleSelectRole}
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
