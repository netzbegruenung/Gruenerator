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
    <div className="chat-page-root flex min-h-0 bg-background">
      <main className="flex min-h-0 flex-1 flex-col pt-4 md:pt-0">
        <GrueneratorThread />
      </main>
    </div>
  );
}
