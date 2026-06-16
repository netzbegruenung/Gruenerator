import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import type * as Y from 'yjs';

/**
 * Live board comments.
 *
 * Comments live relationally in Postgres (React Query is the source of truth),
 * so they aren't part of the board's Yjs state. Instead the backend bumps a
 * per-card counter in the board doc's `commentSignals` map whenever a card's
 * thread changes — a new comment, a reaction, a delete, or an async Grünerator
 * reply. We observe that map and invalidate the affected card's comment query,
 * so the thread refetches live over the WS connection that's already open for
 * the board (no polling, no extra transport). See boardLiveSignalService and the
 * Hocuspocus internal `/internal/board/:boardId/comment-bump` endpoint.
 */
export function useBoardCommentSignal(ydoc: Y.Doc, boardId: string | undefined): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!boardId) return;
    const signals = ydoc.getMap<number>('commentSignals');
    const handler = (event: Y.YMapEvent<number>) => {
      for (const cardId of event.keysChanged) {
        void queryClient.invalidateQueries({ queryKey: ['board-comments', boardId, cardId] });
      }
    };
    signals.observe(handler);
    return () => signals.unobserve(handler);
  }, [ydoc, boardId, queryClient]);
}
