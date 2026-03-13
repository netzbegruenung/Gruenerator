import {
  ChatOverview,
  type NotebookLink,
  GrueneratorThread,
  useAgentStore,
} from '@gruenerator/chat';
import { useCallback, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import withAuthRequired from '@/components/common/LoginRequired/withAuthRequired';
import { SYSTEM_NOTEBOOKS } from '@/features/notebook/config/notebooksConfig';
import { useAuthStore } from '@/stores/authStore';
import { useProfileData } from '@/stores/profileStore';

const notebookLinks: NotebookLink[] = SYSTEM_NOTEBOOKS.map((nb) => ({
  id: nb.id,
  path: nb.path,
  title: nb.title.replace(/^Frag\s+/i, ''),
}));

function ChatPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const chatViewMode = useAgentStore((s) => s.chatViewMode);
  const profile = useProfileData();
  const user = useAuthStore((s) => s.user);

  const firstName = useMemo(() => {
    if (profile?.first_name) return profile.first_name;
    if (user?.display_name) return user.display_name.split(' ')[0];
    if (user?.name) return user.name.split(' ')[0];
    return null;
  }, [profile?.first_name, user?.display_name, user?.name]);

  const handleNavigate = useCallback((path: string) => navigate(path), [navigate]);

  useEffect(() => {
    const agentParam = searchParams.get('agent');
    if (agentParam) {
      useAgentStore.getState().setSelectedAgent(agentParam);
      useAgentStore.getState().setChatViewMode('thread');
    }
  }, [searchParams]);

  return (
    <div className="chat-page-root flex min-h-0 bg-background">
      <main className="flex min-h-0 flex-1 flex-col pt-4 md:pt-0">
        {chatViewMode === 'overview' ? (
          <ChatOverview
            firstName={firstName}
            notebooks={notebookLinks}
            onNavigate={handleNavigate}
          />
        ) : (
          <GrueneratorThread />
        )}
      </main>
    </div>
  );
}

export default withAuthRequired(ChatPage, { title: 'Chat' });
