import { ThreadPrimitive, AuiIf } from '@assistant-ui/react';
import { NotebookComposer } from '@gruenerator/chat';

import { GruenOMatAssistantMessage } from './GruenOMatAssistantMessage';
import { GruenOMatUserMessage } from './GruenOMatUserMessage';
import { WelcomeScreen } from './WelcomeScreen';

export function ChatThread() {
  return (
    <ThreadPrimitive.Root className="flex h-full flex-col">
      <ThreadPrimitive.Viewport className="flex flex-1 flex-col items-center overflow-y-auto scroll-smooth">
        <div className="w-full max-w-[48rem] flex-1 px-4 pt-8 pb-4">
          <AuiIf condition={(s) => s.thread.isEmpty}>
            <WelcomeScreen />
          </AuiIf>

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
