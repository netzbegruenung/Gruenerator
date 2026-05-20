'use client';

import { DocsAssistantChat } from './DocsAssistantChat';
import { DocsChatProvider } from './DocsChatProvider';

interface DocsChatPanelProps {
  documentId: string;
  userId: string | null;
  userName: string | null;
  /** Real document title, threaded into the chat's currentDocument context. */
  documentTitle: string | null;
  /**
   * When true, the chat UI renders inside the provider. When false, the
   * provider stays mounted (runtime + Hocuspocus alive) but no UI shows.
   * This makes close/reopen a free operation — messages and in-flight
   * streams persist across toggles.
   */
  isOpen: boolean;
}

export function DocsChatPanel({
  documentId,
  userId,
  userName,
  documentTitle,
  isOpen,
}: DocsChatPanelProps) {
  return (
    <DocsChatProvider
      documentId={documentId}
      userId={userId}
      userName={userName}
      documentTitle={documentTitle}
    >
      {isOpen ? (
        <DocsAssistantChat />
      ) : // Provider still mounted; runtime + thread + WS connection alive.
      // Rendering null keeps the chat view out of the layout while
      // preserving all chat state for instant reopen.
      null}
    </DocsChatProvider>
  );
}
