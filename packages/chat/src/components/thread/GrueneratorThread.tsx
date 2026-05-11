'use client';

import { useMemo, type ReactNode } from 'react';
import { AuiIf, ThreadPrimitive, SelectionToolbarPrimitive } from '@assistant-ui/react';
import { VoiceControl } from '../assistant-ui/voice';
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
import { useActiveAgentMeta } from '../../lib/useActiveAgentMeta';

interface GrueneratorThreadProps {
  onNavigate?: (path: string) => void;
  firstName?: string | null;
  density?: ChatDensity;
  toolbarExtra?: ReactNode;
  requireProfileHydration?: boolean;
  showMentions?: boolean;
  showPlusMenu?: boolean;
  showToolToggles?: boolean;
  showModelPicker?: boolean;
  composerSlots?: {
    aboveInput?: ReactNode;
    belowInput?: ReactNode;
    sendAdornment?: ReactNode;
  };
}

export function GrueneratorThread({
  onNavigate,
  firstName,
  density = 'comfortable',
  toolbarExtra,
  requireProfileHydration,
  showMentions,
  showPlusMenu,
  showToolToggles,
  showModelPicker,
  composerSlots,
}: GrueneratorThreadProps = {}) {
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const messageComponents = useMemo(() => ({ UserMessage, AssistantMessage }), []);
  const collab = useChatCollaborationContext();
  const collaborators = useCollaborators(collab?.provider ?? null);
  const isCompact = density === 'compact';
  const activeAgent = useActiveAgentMeta();

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
              <WelcomeScreen
                title={activeAgent?.title}
                description={activeAgent?.description}
                questions={activeAgent?.openingQuestions?.map((text) => ({ text }))}
                avatar={activeAgent?.avatar}
              />
            </ThreadPrimitive.Empty>

            <ThreadPrimitive.Messages components={messageComponents} />

            {collab && collab.typingUsers.length > 0 && (
              <TypingIndicator names={collab.typingUsers} />
            )}
          </div>
        </ThreadPrimitive.Viewport>

        <AuiIf condition={(s) => s.thread.capabilities.voice && s.thread.voice != null}>
          <div className="pointer-events-none absolute inset-x-0 bottom-32 z-20 flex justify-center">
            <div className="pointer-events-auto">
              <VoiceControl />
            </div>
          </div>
        </AuiIf>

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
          requireProfileHydration={requireProfileHydration}
          insideAgent={!!activeAgent}
          {...(showMentions !== undefined && { showMentions })}
          {...(showPlusMenu !== undefined && { showPlusMenu })}
          {...(showToolToggles !== undefined && { showToolToggles })}
          {...(showModelPicker !== undefined && { showModelPicker })}
          {...(composerSlots ? { slots: composerSlots } : {})}
        />
      </ThreadPrimitive.Root>
    </ChatDensityContext.Provider>
  );
}
