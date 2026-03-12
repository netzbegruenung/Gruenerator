import { ChatOverview, GrueneratorThread, useAgentStore } from '@gruenerator/chat';
import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

import withAuthRequired from '@/components/common/LoginRequired/withAuthRequired';

function ChatPage() {
  const [searchParams] = useSearchParams();
  const chatViewMode = useAgentStore((s) => s.chatViewMode);

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
        {chatViewMode === 'overview' ? <ChatOverview /> : <GrueneratorThread />}
      </main>
    </div>
  );
}

export default withAuthRequired(ChatPage, { title: 'Chat' });
