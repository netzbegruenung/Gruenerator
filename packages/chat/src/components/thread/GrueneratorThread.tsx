'use client';

import { useMemo } from 'react';
import { ThreadPrimitive, SelectionToolbarPrimitive, useThread } from '@assistant-ui/react';
import { QuoteIcon } from 'lucide-react';
import { ModelSelector } from '../ModelSelector';
import { WelcomeScreen } from './WelcomeScreen';
import { UserMessage } from './UserMessage';
import { AssistantMessage } from './AssistantMessage';
import { GrueneratorComposer } from './GrueneratorComposer';

export function GrueneratorThread() {
  const thread = useThread();
  const messageComponents = useMemo(() => ({ UserMessage, AssistantMessage }), []);

  return (
    <ThreadPrimitive.Root className="relative flex h-full flex-col bg-background">
      <div className="floating-controls-wrapper">
        <div className="floating-controls-left">
          <ModelSelector />
        </div>
      </div>

      <ThreadPrimitive.Viewport className="flex flex-1 flex-col overflow-y-auto scrollbar-thin">
        <div className="flex flex-grow flex-col gap-6 px-4 pt-8 pb-4">
          <ThreadPrimitive.Empty>
            <WelcomeScreen />
          </ThreadPrimitive.Empty>

          <ThreadPrimitive.Messages components={messageComponents} />
        </div>
      </ThreadPrimitive.Viewport>

      <SelectionToolbarPrimitive.Root className="flex items-center gap-1 rounded-lg border border-border bg-background px-1 py-1 shadow-md">
        <SelectionToolbarPrimitive.Quote className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm text-foreground-muted hover:bg-primary/10 hover:text-foreground">
          <QuoteIcon className="size-3.5" />
          Zitieren
        </SelectionToolbarPrimitive.Quote>
      </SelectionToolbarPrimitive.Root>

      <GrueneratorComposer isRunning={thread.isRunning} />
    </ThreadPrimitive.Root>
  );
}
