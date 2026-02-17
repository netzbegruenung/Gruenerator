import { GrueneratorThread, useAgentStore } from '@gruenerator/chat';
import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

export default function ChatPage() {
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
        <GrueneratorThread />
      </main>
    </div>
  );
}
