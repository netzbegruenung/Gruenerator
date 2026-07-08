'use client';

import { SheetsAssistantChat } from './SheetsAssistantChat';
import { SheetsChatProvider } from './SheetsChatProvider';

import type { FUniver } from '@gruenerator/sheets';

interface SheetsChatPanelProps {
  documentId: string;
  userId: string | null;
  userName: string | null;
  documentTitle: string | null;
  univerAPI: FUniver | null;
  /**
   * When true, the chat UI renders inside the provider. When false, the
   * provider stays mounted (runtime + Hocuspocus alive) but no UI shows —
   * close/reopen keeps messages and in-flight streams (docs pattern).
   */
  isOpen: boolean;
}

export function SheetsChatPanel({
  documentId,
  userId,
  userName,
  documentTitle,
  univerAPI,
  isOpen,
}: SheetsChatPanelProps) {
  return (
    <SheetsChatProvider
      documentId={documentId}
      userId={userId}
      userName={userName}
      documentTitle={documentTitle}
      univerAPI={univerAPI}
    >
      {isOpen ? <SheetsAssistantChat /> : null}
    </SheetsChatProvider>
  );
}
