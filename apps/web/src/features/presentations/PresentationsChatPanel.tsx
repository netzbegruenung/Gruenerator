'use client';

import { PresentationsAssistantChat } from './PresentationsAssistantChat';
import { PresentationsChatProvider } from './PresentationsChatProvider';

import type * as Y from 'yjs';

interface PresentationsChatPanelProps {
  documentId: string;
  userId: string | null;
  userName: string | null;
  documentTitle: string | null;
  ydoc: Y.Doc | null;
  /**
   * When true, the chat UI renders inside the provider. When false, the
   * provider stays mounted (runtime + Hocuspocus alive) but no UI shows —
   * close/reopen keeps messages and in-flight streams (docs pattern).
   */
  isOpen: boolean;
}

export function PresentationsChatPanel({
  documentId,
  userId,
  userName,
  documentTitle,
  ydoc,
  isOpen,
}: PresentationsChatPanelProps) {
  return (
    <PresentationsChatProvider
      documentId={documentId}
      userId={userId}
      userName={userName}
      documentTitle={documentTitle}
      ydoc={ydoc}
    >
      {isOpen ? <PresentationsAssistantChat /> : null}
    </PresentationsChatProvider>
  );
}
