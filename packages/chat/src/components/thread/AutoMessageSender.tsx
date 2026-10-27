'use client';

import { useAui } from '@assistant-ui/react';
import { useEffect, useRef } from 'react';

import { notifyError } from '../../lib/notify';
import { useAgentStore } from '../../stores/chatStore';

export function AutoMessageSender() {
  const aui = useAui();
  const composerRuntime = aui.composer;
  const pendingMessage = useAgentStore((s) => s.pendingMessage);
  const pendingDraft = useAgentStore((s) => s.pendingDraft);
  const pendingAttachments = useAgentStore((s) => s.pendingAttachments);
  const pendingInitialAssistantMessage = useAgentStore((s) => s.pendingInitialAssistantMessage);
  const processingRef = useRef(false);

  useEffect(() => {
    if (!pendingInitialAssistantMessage || processingRef.current) return;
    processingRef.current = true;
    void aui.threads.switchToNewThread();
  }, [pendingInitialAssistantMessage, aui]);

  useEffect(() => {
    if (processingRef.current) return;
    // Attachments alone are a hand-off too: "Im Chat besprechen" opens a new
    // chat with the document attached and leaves the question to the person.
    if (!pendingMessage && !pendingDraft && pendingAttachments.length === 0) return;

    const isMessage = !!pendingMessage;
    const text = isMessage ? pendingMessage : pendingDraft;
    const attachments = pendingAttachments;

    processingRef.current = true;
    void aui.threads.switchToNewThread();

    const timer = setTimeout(() => {
      // Cleared in one update before the first await: a re-render while the
      // attachments are added must not find the same hand-off still pending
      // and start a second thread for it.
      useAgentStore.setState(
        isMessage
          ? { pendingMessage: null, pendingAttachments: [] }
          : { pendingDraft: null, pendingAttachments: [] }
      );
      void (async () => {
        try {
          if (text) composerRuntime.setText(text);
          // Before sending: a summary request without its document would
          // summarise the empty conversation instead.
          for (const attachment of attachments) {
            await composerRuntime.addAttachment(attachment);
          }
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
        processingRef.current = false;
      })();
    }, 500);

    return () => {
      clearTimeout(timer);
      processingRef.current = false;
    };
  }, [pendingMessage, pendingDraft, pendingAttachments, composerRuntime, aui]);

  return null;
}
