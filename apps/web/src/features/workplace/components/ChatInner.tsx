import { ThreadPrimitive } from '@assistant-ui/react';
import { GrueneratorComposer, SwitchToThreadOnSend } from '@gruenerator/chat';
import React, { memo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { useFirstName } from '../../../hooks/useFirstName';

import { cn } from '@/utils/cn';

const ChatInner: React.FC = memo(() => {
  const navigate = useNavigate();
  const firstName = useFirstName();

  const handleNavigate = useCallback((path: string) => navigate(path), [navigate]);

  return (
    <ThreadPrimitive.Root
      className={cn('w-full shrink-0', '[&>div]:px-0', '[&>div>p.text-center]:hidden')}
    >
      <SwitchToThreadOnSend />
      <GrueneratorComposer onNavigate={handleNavigate} firstName={firstName} />
    </ThreadPrimitive.Root>
  );
});

ChatInner.displayName = 'ChatInner';

export default ChatInner;
