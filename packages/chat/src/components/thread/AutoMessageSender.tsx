'use client';

import { useEffect, useRef } from 'react';
import { useAssistantRuntime, useComposerRuntime } from '@assistant-ui/react';
import { useAgentStore } from '../../stores/chatStore';

export function AutoMessageSender() {
  const assistantRuntime = useAssistantRuntime();
  const composerRuntime = useComposerRuntime();
  const pendingMessage = useAgentStore((s) => s.pendingMessage);
  const setPendingMessage = useAgentStore((s) => s.setPendingMessage);
  const currentThreadId = useAgentStore((s) => s.currentThreadId);
  const phaseRef = useRef<'idle' | 'switching'>('idle');
  const prevThreadIdRef = useRef<string | null>(null);

  // Phase 1: Switch to new thread when pending message appears
  useEffect(() => {
    if (pendingMessage && phaseRef.current === 'idle') {
      prevThreadIdRef.current = currentThreadId;
      phaseRef.current = 'switching';
      assistantRuntime.switchToNewThread();
    }
  }, [pendingMessage, assistantRuntime, currentThreadId]);

  // Phase 2: Send message when new thread is ready (currentThreadId changed)
  useEffect(() => {
    if (
      phaseRef.current !== 'switching' ||
      !pendingMessage ||
      currentThreadId === prevThreadIdRef.current
    ) {
      return;
    }

    const timer = setTimeout(() => {
      try {
        composerRuntime.setText(pendingMessage);
        composerRuntime.send();
        setPendingMessage(null);
      } catch (err) {
        console.warn('[AutoMessageSender] Failed to send:', err);
      }
      phaseRef.current = 'idle';
    }, 300);
    return () => clearTimeout(timer);
  }, [currentThreadId, pendingMessage, composerRuntime, setPendingMessage]);

  return null;
}
