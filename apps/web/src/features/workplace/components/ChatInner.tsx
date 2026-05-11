import { ThreadPrimitive, useThreadRuntime, useVoiceState } from '@assistant-ui/react';
import { GrueneratorComposer, useAgentStore } from '@gruenerator/chat';
import React, { memo, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { useFirstName } from '../../../hooks/useFirstName';
import { useHydrateUserProfile } from '../../../hooks/useHydrateUserProfile';

import SkillPresetRow from './SkillPresetRow';

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

const ChatInner: React.FC = memo(() => {
  const navigate = useNavigate();
  const firstName = useFirstName();
  useHydrateUserProfile();
  const threadRuntime = useThreadRuntime({ optional: true });

  const handleNavigate = useCallback((path: string) => navigate(path), [navigate]);

  if (!threadRuntime) return null;

  return (
    <ThreadPrimitive.Root
      className={cn('w-full shrink-0', '[&>div]:px-0', '[&>div>p.text-center]:hidden')}
    >
      <NavigateToChatOnSend />
      <GrueneratorComposer
        onNavigate={handleNavigate}
        firstName={firstName}
        toolbarExtra={<SkillPresetRow />}
      />
    </ThreadPrimitive.Root>
  );
});

ChatInner.displayName = 'ChatInner';

export default ChatInner;
