'use client';

import { BoardAssistantChat } from './BoardAssistantChat';
import { BoardAssistantProvider } from './BoardAssistantProvider';

import type { BoardMutations } from './applyBoardOperations';

interface BoardAssistantPanelProps {
  boardId: string;
  userId: string | null;
  userName: string | null;
  boardTitle: string | null;
  /** Live board mutation surface (lifted useBoardState from BoardContent). */
  boardState: BoardMutations;
  /**
   * When true, the chat UI renders. When false the provider stays mounted
   * (runtime + Hocuspocus + thread alive) but no UI shows — close/reopen is
   * free, messages and in-flight streams persist.
   */
  isOpen: boolean;
}

export function BoardAssistantPanel({
  boardId,
  userId,
  userName,
  boardTitle,
  boardState,
  isOpen,
}: BoardAssistantPanelProps) {
  return (
    <BoardAssistantProvider
      boardId={boardId}
      userId={userId}
      userName={userName}
      boardTitle={boardTitle}
      boardState={boardState}
    >
      {isOpen ? <BoardAssistantChat /> : null}
    </BoardAssistantProvider>
  );
}
