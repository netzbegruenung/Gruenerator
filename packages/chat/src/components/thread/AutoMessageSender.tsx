'use client';

import { useAui } from '@assistant-ui/react';
import { useEffect, useRef } from 'react';

import { notifyError } from '../../lib/notify';
import { useAgentStore } from '../../stores/chatStore';

export function AutoMessageSender() {
  const aui = useAui();
  const composerRuntime = aui.composer;
  const pendingMessage = useAgentStore((s) => s.pendingMessage);
  const setPendingMessage = useAgentStore((s) => s.setPendingMessage);
  const pendingDraft = useAgentStore((s) => s.pendingDraft);
  const setPendingDraft = useAgentStore((s) => s.setPendingDraft);
  const pendingInitialAssistantMessage = useAgentStore((s) => s.pendingInitialAssistantMessage);
  const processingRef = useRef(false);

  useEffect(() => {
    if (!pendingInitialAssistantMessage || processingRef.current) return;
    processingRef.current = true;
    void aui.threads.switchToNewThread();
  }, [pendingInitialAssistantMessage, aui]);

  useEffect(() => {
    if (processingRef.current) return;
    if (!pendingMessage && !pendingDraft) return;

    const isMessage = !!pendingMessage;
    const text = isMessage ? pendingMessage : pendingDraft;
    if (!text) return;

    processingRef.current = true;
    void aui.threads.switchToNewThread();

    const timer = setTimeout(() => {
      try {
        composerRuntime.setText(text);
        if (isMessage) {
          composerRuntime.send();
        }
      } catch (err) {
        console.warn('[AutoMessageSender] Failed:', err);
        if (isMessage) {
          notifyError(
            'Nachricht konnte nicht gesendet werden',
            'Der Text steht weiterhin im Eingabefeld.'
          );
        }
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
  }, [pendingMessage, pendingDraft, composerRuntime, aui, setPendingMessage, setPendingDraft]);

  return null;
}
