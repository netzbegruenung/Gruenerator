import { ThreadPrimitive } from '@assistant-ui/react';
import { NotebookChatProvider, NotebookComposer, useChatConfigStore } from '@gruenerator/chat';
import { useEffect } from 'react';

import { GruenOMatAssistantMessage } from './components/GruenOMatAssistantMessage';
import { GruenOMatUserMessage } from './components/GruenOMatUserMessage';
import { RateLimitBadge } from './components/RateLimitBadge';
import { WelcomeScreen } from './components/WelcomeScreen';

const COLLECTION = { id: 'gruene-de-system', name: 'gruene.de', linkType: 'url' as const };

function ChatThread() {
  return (
    <ThreadPrimitive.Root className="flex h-full flex-col">
      <ThreadPrimitive.Viewport className="flex flex-1 flex-col items-center overflow-y-auto scroll-smooth">
        <div className="w-full max-w-[48rem] flex-1 px-4 pt-8 pb-4">
          <ThreadPrimitive.Empty>
            <WelcomeScreen />
          </ThreadPrimitive.Empty>

          <ThreadPrimitive.Messages
            components={{
              UserMessage: GruenOMatUserMessage,
              AssistantMessage: GruenOMatAssistantMessage,
            }}
          />
        </div>

        <div className="sticky bottom-0 w-full max-w-[48rem] px-4 pb-4">
          <NotebookComposer placeholder="Stell deine Frage zu grüner Politik..." />
        </div>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
}

export function App() {
  useEffect(() => {
    useChatConfigStore.getState().configure({
      fetch: (url, opts) => fetch(url, { ...opts }),
      onUnauthorized: () => {},
    });
  }, []);

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white text-sm font-bold">
          G
        </div>
        <h1 className="text-lg font-semibold">Grün-O-Mat</h1>
        <span className="text-sm text-foreground-muted">Frag die Grünen Dokumente</span>
        <div className="ml-auto">
          <RateLimitBadge />
        </div>
      </header>

      <main className="flex-1 overflow-hidden">
        <NotebookChatProvider
          collections={[COLLECTION]}
          mode="fast"
          endpoint="/api/gruen-o-mat/stream"
        >
          <ChatThread />
        </NotebookChatProvider>
      </main>
    </div>
  );
}
