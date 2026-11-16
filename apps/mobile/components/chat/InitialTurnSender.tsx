import { useAui } from '@assistant-ui/react-native';
import { useEffect, useEffectEvent } from 'react';

import { useNoticeStore } from '../../stores/noticeStore';
import { usePendingAttachmentStore } from '../../stores/pendingAttachmentStore';

/**
 * Drains anything the start screen queued (a file or a document reference picked
 * before this thread existed), then sends the message it was opened with.
 *
 * One component for both because the order matters: `addAttachment` is async,
 * and a send that fires first would leave the attachment behind on a thread the
 * user has already moved past. A runtime without attachments (the notebook
 * chat) leaves the queue alone with `drainAttachments={false}`.
 */
export function InitialTurnSender({
  message,
  drainAttachments = true,
  beforeSend,
}: {
  message: string;
  drainAttachments?: boolean;
  /** Runs first, e.g. to create the thread a Projekt chat is filed in.
   *  Resolves false when this hand-off already ran (nothing is sent); if it
   *  throws, nothing is sent and the text goes back to the composer. */
  beforeSend?: () => Promise<boolean>;
}) {
  const aui = useAui();

  // Only the props from the first render count: a later `message` belongs to
  // a thread the user has already moved past.
  const sendOpening = useEffectEvent(async () => {
    if (beforeSend) {
      try {
        if (!(await beforeSend())) return;
      } catch {
        useNoticeStore
          .getState()
          .show(
            'error',
            'Der Chat konnte nicht gestartet werden.',
            'Bitte versuche es noch einmal.'
          );
        // No thread, no turn: hand the text back to the composer instead of
        // sending it into a chat that is not filed in the Projekt.
        if (message) aui.composer.setText(message);
        return;
      }
    }
    if (drainAttachments) {
      for (const attachment of usePendingAttachmentStore.getState().drain()) {
        await aui.composer.addAttachment(attachment);
      }
    }
    if (message) {
      aui.composer.setText(message);
      aui.composer.send();
    }
  });

  useEffect(() => {
    void sendOpening();
  }, []);

  return null;
}
