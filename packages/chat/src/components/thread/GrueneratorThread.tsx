'use client';

import { useMemo, type ReactNode } from 'react';
import { ThreadPrimitive, SelectionToolbarPrimitive } from '@assistant-ui/react';
import { useAuiState } from '@assistant-ui/store';
import { QuoteIcon } from 'lucide-react';
import { useCollaborators, PresenceAvatars, TypingIndicator } from '@gruenerator/collab';
import { WelcomeScreen } from './WelcomeScreen';
import { UserMessage } from './UserMessage';
import { AssistantMessage } from './AssistantMessage';
import { GrueneratorComposer } from './GrueneratorComposer';
import { AutoMessageSender } from './AutoMessageSender';
import { ChatDensityContext, type ChatDensity } from './chatDensityContext';
import { useChatCollaborationContext } from '../../context/ChatCollaborationContext';

interface GrueneratorThreadProps {
  onNavigate?: (path: string) => void;
  firstName?: string | null;
  /**
   * Visual density. `compact` shrinks font + spacing for narrow embedded
   * surfaces (e.g. docs editor sidebar). Defaults to `comfortable`.
   */
  density?: ChatDensity;
  /**
   * Extra elements rendered in the composer toolbar after the standard tool
   * toggles. Used by embedded surfaces (e.g. docs sidebar) to inject
   * context-specific controls without coupling them to the shared composer.
   */
  toolbarExtra?: ReactNode;
}

export function GrueneratorThread({
  onNavigate,
  firstName,
  density = 'comfortable',
  toolbarExtra,
}: GrueneratorThreadProps = {}) {
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const messageComponents = useMemo(() => ({ UserMessage, AssistantMessage }), []);
  const collab = useChatCollaborationContext();
  const collaborators = useCollaborators(collab?.provider ?? null);
  const isCompact = density === 'compact';

  return (
    <ChatDensityContext.Provider value={density}>
      <ThreadPrimitive.Root className="relative flex h-full min-h-0 flex-col bg-background">
        <AutoMessageSender />

        {collaborators.length > 0 && (
          <div className="absolute top-3 left-3 z-10 pointer-events-auto">
            <PresenceAvatars collaborators={collaborators} compact />
          </div>
        )}

        <ThreadPrimitive.Viewport className="flex flex-1 flex-col overflow-y-auto overflow-x-hidden scrollbar-thin">
          <div
            className={
              isCompact
                ? 'flex flex-grow flex-col gap-2 px-2 pt-3 pb-2'
                : 'flex flex-grow flex-col gap-6 px-4 pt-8 pb-4'
            }
          >
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
          isRunning={isRunning}
          onNavigate={onNavigate}
          firstName={firstName}
          toolbarExtra={toolbarExtra}
        />
      </ThreadPrimitive.Root>
    </ChatDensityContext.Provider>
  );
}
