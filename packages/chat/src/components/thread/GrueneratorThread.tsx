'use client';

import { useMemo, useState } from 'react';
import { ThreadPrimitive, SelectionToolbarPrimitive, useThread } from '@assistant-ui/react';
import { QuoteIcon } from 'lucide-react';
import { useCollaborators, PresenceAvatars, TypingIndicator } from '@gruenerator/collab';
import { WelcomeScreen } from './WelcomeScreen';
import { UserMessage } from './UserMessage';
import { AssistantMessage } from './AssistantMessage';
import { GrueneratorComposer } from './GrueneratorComposer';
import { AutoMessageSender } from './AutoMessageSender';
import { useChatCollaborationContext } from '../../context/ChatCollaborationContext';

interface GrueneratorThreadProps {
  onNavigate?: (path: string) => void;
  firstName?: string | null;
}

export function GrueneratorThread({ onNavigate, firstName }: GrueneratorThreadProps = {}) {
  const thread = useThread();
  const messageComponents = useMemo(() => ({ UserMessage, AssistantMessage }), []);
  const collab = useChatCollaborationContext();
  const collaborators = useCollaborators(collab?.provider ?? null);

  return (
    <ThreadPrimitive.Root className="relative flex h-full min-h-0 flex-col bg-background">
      <AutoMessageSender />

      {collaborators.length > 0 && (
        <div className="absolute top-3 left-3 z-10 pointer-events-auto">
          <PresenceAvatars collaborators={collaborators} compact />
        </div>
      )}

      <ThreadPrimitive.Viewport className="flex flex-1 flex-col overflow-y-auto overflow-x-hidden scrollbar-thin">
        <div className="flex flex-grow flex-col gap-6 px-4 pt-8 pb-4">
          <ThreadPrimitive.Empty>
            <WelcomeScreen />
          </ThreadPrimitive.Empty>

          <ThreadPrimitive.Messages components={messageComponents} />

          {collab && collab.typingUsers.length > 0 && (
            <TypingIndicator names={collab.typingUsers} />
          )}
        </div>
      </ThreadPrimitive.Viewport>

      <SelectionToolbarPrimitive.Root className="flex items-center gap-1 rounded-lg border border-border bg-background px-1 py-1 shadow-md">
        <SelectionToolbarPrimitive.Quote className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm text-foreground-muted hover:bg-primary/10 hover:text-foreground">
          <QuoteIcon className="size-3.5" />
          Zitieren
        </SelectionToolbarPrimitive.Quote>
      </SelectionToolbarPrimitive.Root>

      <GrueneratorComposer
        isRunning={thread.isRunning}
        onNavigate={onNavigate}
        firstName={firstName}
      />
    </ThreadPrimitive.Root>
  );
}
