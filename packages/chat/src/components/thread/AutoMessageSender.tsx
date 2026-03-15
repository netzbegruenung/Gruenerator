'use client';

import { useEffect, useRef } from 'react';
import { useAssistantRuntime, useComposerRuntime } from '@assistant-ui/react';
import { useAgentStore } from '../../stores/chatStore';

export function AutoMessageSender() {
  const assistantRuntime = useAssistantRuntime();
  const composerRuntime = useComposerRuntime();
  const pendingMessage = useAgentStore((s) => s.pendingMessage);
  const setPendingMessage = useAgentStore((s) => s.setPendingMessage);
  const pendingDraft = useAgentStore((s) => s.pendingDraft);
  const setPendingDraft = useAgentStore((s) => s.setPendingDraft);
  const switchedRef = useRef<'message' | 'draft' | false>(false);

  // Phase 1: Switch to new thread when pending message or draft appears
  useEffect(() => {
    if ((pendingMessage || pendingDraft) && !switchedRef.current) {
      switchedRef.current = pendingMessage ? 'message' : 'draft';
      assistantRuntime.switchToNewThread();
    }
    if (!pendingMessage && !pendingDraft) {
      switchedRef.current = false;
    }
  }, [pendingMessage, pendingDraft, assistantRuntime]);

  // Phase 2: Send message or set draft after thread is ready
  useEffect(() => {
    if (!switchedRef.current) return;
    const text = switchedRef.current === 'message' ? pendingMessage : pendingDraft;
    if (!text) return;

    const timer = setTimeout(() => {
      try {
        composerRuntime.setText(text);
        if (switchedRef.current === 'message') {
          composerRuntime.send();
        }
      } catch (err) {
        console.warn('[AutoMessageSender] Failed:', err);
      }
      if (switchedRef.current === 'message') {
        setPendingMessage(null);
      } else {
        setPendingDraft(null);
      }
      switchedRef.current = false;
    }, 500);

    return () => clearTimeout(timer);
  }, [pendingMessage, pendingDraft, composerRuntime, setPendingMessage, setPendingDraft]);

  return null;
}
