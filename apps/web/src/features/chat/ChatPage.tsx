import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { GrueneratorThread, useAgentStore } from '@gruenerator/chat';

import useSidebarStore from '../../stores/sidebarStore';

export default function ChatPage() {
  const { isOpen, toggle } = useSidebarStore();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const agentParam = searchParams.get('agent');
    if (agentParam) {
      useAgentStore.getState().setSelectedAgent(agentParam);
    }
  }, [searchParams]);

  return (
    <div className="chat-page-root flex overflow-hidden bg-background">
      <main className="flex flex-1 flex-col overflow-hidden">
        <GrueneratorThread sidebarOpen={isOpen} onToggleSidebar={toggle} />
      </main>
    </div>
  );
}
