'use client';

import { useEffect, useRef } from 'react';
import { useAssistantRuntime, useComposerRuntime } from '@assistant-ui/react';
import { useAgentStore } from '../../stores/chatStore';

export function AutoMessageSender() {
  const assistantRuntime = useAssistantRuntime();
  const composerRuntime = useComposerRuntime();
  const pendingMessage = useAgentStore((s) => s.pendingMessage);
  const setPendingMessage = useAgentStore((s) => s.setPendingMessage);
  const switchedRef = useRef(false);

  // Phase 1: Switch to new thread when pending message appears
  useEffect(() => {
    if (pendingMessage && !switchedRef.current) {
      switchedRef.current = true;
      assistantRuntime.switchToNewThread();
    }
    if (!pendingMessage) {
      switchedRef.current = false;
    }
  }, [pendingMessage, assistantRuntime]);

  // Phase 2: Send message after thread is ready
  // composerRuntime may change during thread switch — timer resets each time
  useEffect(() => {
    if (!pendingMessage || !switchedRef.current) return;

    const timer = setTimeout(() => {
      try {
        composerRuntime.setText(pendingMessage);
        composerRuntime.send();
      } catch (err) {
        console.warn('[AutoMessageSender] Failed to send:', err);
      }
      setPendingMessage(null);
      switchedRef.current = false;
    }, 500);

    return () => clearTimeout(timer);
  }, [pendingMessage, composerRuntime, setPendingMessage]);

  return null;
}
