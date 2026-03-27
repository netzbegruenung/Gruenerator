import { ThreadPrimitive, useThreadRuntime } from '@assistant-ui/react';
import { GrueneratorComposer, useAgentStore } from '@gruenerator/chat';
import React, { memo, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { useFirstName } from '../../../hooks/useFirstName';

import { cn } from '@/utils/cn';

function NavigateToChatOnSend() {
  const navigate = useNavigate();
  const threadRuntime = useThreadRuntime();
  const hasNavigated = useRef(false);

  useEffect(() => {
    return threadRuntime.subscribe(() => {
      if (threadRuntime.getState().isRunning && !hasNavigated.current) {
        hasNavigated.current = true;
        useAgentStore.getState().setChatViewMode('thread');
        navigate('/chat');
      }
      if (!threadRuntime.getState().isRunning) {
        hasNavigated.current = false;
      }
    });
  }, [threadRuntime, navigate]);

  return null;
}

const ChatInner: React.FC = memo(() => {
  const navigate = useNavigate();
  const firstName = useFirstName();

  const handleNavigate = useCallback((path: string) => navigate(path), [navigate]);

  return (
    <ThreadPrimitive.Root
      className={cn('w-full shrink-0', '[&>div]:px-0', '[&>div>p.text-center]:hidden')}
    >
      <NavigateToChatOnSend />
      <GrueneratorComposer onNavigate={handleNavigate} firstName={firstName} />
    </ThreadPrimitive.Root>
  );
});

ChatInner.displayName = 'ChatInner';

export default ChatInner;
