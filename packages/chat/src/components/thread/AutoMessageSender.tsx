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
  const processingRef = useRef(false);

  useEffect(() => {
    if (processingRef.current) return;
    if (!pendingMessage && !pendingDraft) return;

    const isMessage = !!pendingMessage;
    const text = isMessage ? pendingMessage : pendingDraft;
    if (!text) return;

    processingRef.current = true;
    assistantRuntime.switchToNewThread();

    const timer = setTimeout(() => {
      try {
        composerRuntime.setText(text);
        if (isMessage) {
          composerRuntime.send();
        }
      } catch (err) {
        console.warn('[AutoMessageSender] Failed:', err);
      }
      if (isMessage) {
        setPendingMessage(null);
      } else {
        setPendingDraft(null);
      }
      processingRef.current = false;
    }, 500);

    return () => {
      clearTimeout(timer);
      processingRef.current = false;
    };
  }, [
    pendingMessage,
    pendingDraft,
    composerRuntime,
    assistantRuntime,
    setPendingMessage,
    setPendingDraft,
  ]);

  return null;
}
