'use client';

import { BoardAssistantChat } from './BoardAssistantChat';
import { BoardAssistantProvider } from './BoardAssistantProvider';

import type { BoardMutations } from './applyBoardOperations';
import type { BoardView, Row } from './types';

interface BoardAssistantPanelProps {
  boardId: string;
  userId: string | null;
  userName: string | null;
  boardTitle: string | null;
  /** Live board mutation surface (lifted useBoardState from BoardContent). */
  boardState: BoardMutations & { rows: Row[]; views: BoardView[] };
  /** Active view's grouping field — AI column/status ops target this field. */
  groupByFieldId?: string;
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
  groupByFieldId,
  isOpen,
}: BoardAssistantPanelProps) {
  return (
    <BoardAssistantProvider
      boardId={boardId}
      userId={userId}
      userName={userName}
      boardTitle={boardTitle}
      boardState={boardState}
      groupByFieldId={groupByFieldId}
    >
      {isOpen ? <BoardAssistantChat /> : null}
    </BoardAssistantProvider>
  );
}
