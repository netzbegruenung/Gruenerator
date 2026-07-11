import {
  ThreadPrimitive,
  useAssistantRuntime,
  useThreadRuntime,
  useVoiceState,
} from '@assistant-ui/react';
import { GrueneratorComposer, useAgentStore, useChatRuntimeReady } from '@gruenerator/chat';
import React, { memo, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { useFirstName } from '../../../hooks/useFirstName';

import { WORKPLACE_PRESETS } from './workplacePresets';

import { cn } from '@/utils/cn';

function NavigateToChatOnSend() {
  const navigate = useNavigate();
  const threadRuntime = useThreadRuntime({ optional: true });
  const voiceState = useVoiceState();
  const hasNavigated = useRef(false);

  // Voice sessions don't flip `threadRuntime.isRunning` because transcripts
  // bypass the model adapter. Without this hop, voice messages would be
  // appended to the runtime but never displayed (workplace has no Thread).
  const voiceActive =
    voiceState?.status.type === 'starting' || voiceState?.status.type === 'running';
  useEffect(() => {
    if (voiceActive && !hasNavigated.current) {
      hasNavigated.current = true;
      useAgentStore.getState().setChatViewMode('thread');
      void navigate('/chat');
    }
  }, [voiceActive, navigate]);

  useEffect(() => {
    if (!threadRuntime) return;
    return threadRuntime.subscribe(() => {
      if (threadRuntime.getState().isRunning && !hasNavigated.current) {
        hasNavigated.current = true;
        useAgentStore.getState().setChatViewMode('thread');
        void navigate('/chat');
      }
      if (!threadRuntime.getState().isRunning && !voiceActive) {
        hasNavigated.current = false;
      }
    });
  }, [threadRuntime, navigate, voiceActive]);

  return null;
}

const ChatInnerReady: React.FC = () => {
  const navigate = useNavigate();
  const firstName = useFirstName();
  const threadRuntime = useThreadRuntime({ optional: true });
  const assistantRuntime = useAssistantRuntime();

  const handleNavigate = useCallback((path: string) => navigate(path), [navigate]);

  // The workplace composer is a "new chat" entry point — reset any agent/skill
  // context carried over from a previous session AND start a fresh thread so a
  // message sent from here never continues the last active chat. The runtime is
  // hoisted to the app root, so without switchToNewThread the composer stays
  // bound to the persisted currentThreadId (mirrors the /chat overview).
  useEffect(() => {
    const { pendingMessage, pendingDraft, pendingInitialAssistantMessage } =
      useAgentStore.getState();
    // A pending message means another surface queued content for /chat; don't
    // clobber it by switching threads (same guard ChatOverview uses).
    if (pendingMessage || pendingDraft || pendingInitialAssistantMessage) return;
    useAgentStore.getState().resetChatContext();
    void assistantRuntime.threads.switchToNewThread();
  }, [assistantRuntime]);

  if (!threadRuntime) return null;

  return (
    <ThreadPrimitive.Root
      className={cn(
        'w-full shrink-0 mx-auto max-w-[720px]',
        '[&>div]:px-0',
        // The hero shows the mode-toggle link instead of the disclaimer.
        '[&>div>p.text-center]:hidden'
      )}
    >
      <NavigateToChatOnSend />
      <GrueneratorComposer
        variant="pill"
        onNavigate={handleNavigate}
        firstName={firstName}
        presets={WORKPLACE_PRESETS}
        requireProfileHydration
      />
    </ThreadPrimitive.Root>
  );
};

// While the lazy assistant-ui runtime chunk loads, GrueneratorChatProvider's
// Suspense fallback renders the page WITHOUT AssistantRuntimeProvider — calling
// useAssistantRuntime()/useVoiceState() there crashes with "requires an
// AuiProvider". Gate on runtime readiness (same guard as ChatPage/SearchPage)
// and reserve the composer's footprint so the hero doesn't jump.
const ChatInner: React.FC = memo(() => {
  const runtimeReady = useChatRuntimeReady();
  if (!runtimeReady) {
    return <div className="w-full shrink-0 mx-auto max-w-[720px] min-h-24" aria-hidden />;
  }
  return <ChatInnerReady />;
});

ChatInner.displayName = 'ChatInner';

export default ChatInner;
