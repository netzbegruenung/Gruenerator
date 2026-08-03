'use client';

import {
  AuiIf,
  ThreadPrimitive,
  SelectionToolbarPrimitive,
  useVoiceControls,
} from '@assistant-ui/react';
import { useAuiState } from '@assistant-ui/store';
import { useCollaborators, PresenceAvatars, TypingIndicator } from '@gruenerator/collab';
import { QuoteIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';

import { useChatCollaborationContext } from '../../context/ChatCollaborationContext';
import { useActiveAgentMeta } from '../../lib/useActiveAgentMeta';
import { cn } from '../../lib/utils';
import { VoiceOrb } from '../assistant-ui/voice';

import { AssistantMessage } from './AssistantMessage';
import { AutoMessageSender } from './AutoMessageSender';
import { ChatDensityContext, type ChatDensity } from './chatDensityContext';
import { CompactionIndicator } from './CompactionIndicator';
import { GrueneratorComposer } from './GrueneratorComposer';
import { InlineAttachmentNotice } from './InlineAttachmentNotice';
import { UserMessage } from './UserMessage';
import { WelcomeScreen } from './WelcomeScreen';

interface GrueneratorThreadProps {
  onNavigate?: (path: string) => void;
  firstName?: string | null;
  density?: ChatDensity;
  toolbarExtra?: ReactNode;
  showMentions?: boolean;
  showPlusMenu?: boolean;
  showToolToggles?: boolean;
  showModelPicker?: boolean;
  composerSlots?: {
    aboveInput?: ReactNode;
    belowInput?: ReactNode;
    sendAdornment?: ReactNode;
  };
  requireProfileHydration?: boolean;
  /**
   * Extra classes on the thread's root. The one surface a consumer can dress:
   * the root carries `bg-background`, so a page that wants its own ground under
   * the conversation — web's `chat-thread-glow` band under the composer — has to
   * paint it here rather than on an ancestor, which the root would cover.
   */
  className?: string;
  /**
   * Which composer the thread wears — `card` (input above its own toolbar row)
   * or `pill` (one capsule). Defaults to `card`, which is what every consumer
   * had before this prop existed.
   *
   * The choice belongs to the consumer, not to this component: the browser and
   * the desktop shell render the same thread and want different answers.
   */
  composerVariant?: 'card' | 'pill';
  /**
   * User's locale (`'de-DE'` or `'de-AT'`). Plumbed into `useActiveAgentMeta`
   * so the welcome screen (greeting, opening questions, party-name
   * placeholders) renders AT-flavored copy for Austrian users. Defaults to
   * `'de-DE'` when the consumer hasn't wired locale through yet.
   */
  userLocale?: string;
}

function VoiceOrbOverlay() {
  const { disconnect } = useVoiceControls();
  const disconnectRef = useRef(disconnect);
  disconnectRef.current = disconnect;

  // Privacy: when the overlay unmounts (route change, parent unmount, voice
  // capability removed), end the session. The adapter's tearDown is
  // idempotent, so this is safe even when the unmount was *caused* by the
  // session ending normally.
  useEffect(() => {
    return () => disconnectRef.current();
  }, []);

  // Float as a thread-anchored indicator instead of a full-screen modal so
  // the live transcript (auto-rendered from emitTranscript) stays visible
  // and the user reads the conversation in parallel with the audio.
  return (
    <button
      type="button"
      onClick={() => disconnect()}
      aria-label="Sprachsitzung beenden"
      className="absolute left-1/2 top-6 z-30 -translate-x-1/2 rounded-full p-2 transition-transform animate-in fade-in zoom-in-90 duration-300 hover:scale-105"
    >
      <VoiceOrb className="size-44 drop-shadow-2xl md:size-56" />
    </button>
  );
}

export function GrueneratorThread({
  onNavigate,
  firstName,
  density = 'comfortable',
  toolbarExtra,
  showMentions,
  showPlusMenu,
  showToolToggles,
  showModelPicker,
  composerSlots,
  requireProfileHydration,
  className,
  composerVariant = 'card',
  userLocale,
}: GrueneratorThreadProps = {}) {
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const messageComponents = useMemo(() => ({ UserMessage, AssistantMessage }), []);
  const collab = useChatCollaborationContext();
  const collaborators = useCollaborators(collab?.provider ?? null);
  const isCompact = density === 'compact';
  const activeAgent = useActiveAgentMeta(userLocale);

  return (
    <ChatDensityContext.Provider value={density}>
      <ThreadPrimitive.Root
        className={cn('relative flex h-full min-h-0 flex-col bg-background', className)}
      >
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
                firstName={firstName ?? null}
                description={activeAgent?.description}
                questions={activeAgent?.openingQuestions?.map((text) => ({ text }))}
                avatar={activeAgent?.avatar}
                {...(activeAgent?.icon ? { icon: activeAgent.icon } : {})}
                {...(activeAgent?.welcomeQuestion
                  ? { welcomeQuestion: activeAgent.welcomeQuestion }
                  : {})}
              />
            </ThreadPrimitive.Empty>

            <CompactionIndicator />

            <ThreadPrimitive.Messages components={messageComponents} />

            <InlineAttachmentNotice />

            {collab && collab.typingUsers.length > 0 && (
              <TypingIndicator names={collab.typingUsers} />
            )}
          </div>
        </ThreadPrimitive.Viewport>

        <AuiIf condition={(s) => s.thread.capabilities.voice && s.thread.voice != null}>
          <VoiceOrbOverlay />
        </AuiIf>

        <SelectionToolbarPrimitive.Root className="flex items-center gap-1 rounded-lg border border-border bg-background px-1 py-1 shadow-md">
          <SelectionToolbarPrimitive.Quote className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm text-foreground-muted hover:bg-primary/10 hover:text-foreground">
            <QuoteIcon className="size-3.5" />
            Zitieren
          </SelectionToolbarPrimitive.Quote>
        </SelectionToolbarPrimitive.Root>

        <GrueneratorComposer
          variant={composerVariant}
          isRunning={isRunning}
          onNavigate={onNavigate}
          firstName={firstName}
          toolbarExtra={toolbarExtra}
          insideAgent={!!activeAgent}
          {...(showMentions !== undefined && { showMentions })}
          {...(showPlusMenu !== undefined && { showPlusMenu })}
          {...(showToolToggles !== undefined && { showToolToggles })}
          {...(showModelPicker !== undefined && { showModelPicker })}
          {...(composerSlots ? { slots: composerSlots } : {})}
          {...(requireProfileHydration !== undefined && { requireProfileHydration })}
        />
      </ThreadPrimitive.Root>
    </ChatDensityContext.Provider>
  );
}
