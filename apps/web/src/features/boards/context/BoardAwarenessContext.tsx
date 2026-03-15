import { createContext, useContext } from 'react';

import type { RemoteActivity } from '../hooks/useBoardAwareness';

const BoardAwarenessContext = createContext<RemoteActivity[]>([]);

export const BoardAwarenessProvider = BoardAwarenessContext.Provider;

export function useRemoteActivities(): RemoteActivity[] {
  return useContext(BoardAwarenessContext);
}

export function useCardActivity(cardId: string) {
  const activities = useContext(BoardAwarenessContext);
  return activities.filter((a) => a.selectedCardId === cardId || a.draggedCardId === cardId);
}

export function useColumnActivity(columnId: string) {
  const activities = useContext(BoardAwarenessContext);
  return activities.filter(
    (a) => a.activeColumnId === columnId || a.dragTargetColumnId === columnId
  );
}
