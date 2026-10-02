import { useAui } from '@assistant-ui/react-native';
import { useEffect } from 'react';

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
}: {
  message: string;
  drainAttachments?: boolean;
}) {
  const aui = useAui();

  useEffect(() => {
    void (async () => {
      if (drainAttachments) {
        for (const attachment of usePendingAttachmentStore.getState().drain()) {
          await aui.composer.addAttachment(attachment);
        }
      }
      if (message) {
        aui.composer.setText(message);
        aui.composer.send();
      }
    })();
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
