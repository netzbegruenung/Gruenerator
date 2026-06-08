import { type ActivityType } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * Board-wide activity feed (A8): all card events + board-level events, newest
 * first. `recordBoardEvent` logs a board-level event (rename/archive/duplicate…)
 * which also notifies board watchers (A9) server-side.
 */
export function useBoardActivityFeed(boardId: string | undefined, enabled = true) {
  const queryClient = useQueryClient();
  const queryKey = ['board-activity-feed', boardId];

  const feedQuery = useQuery({
    queryKey,
    queryFn: async () => {
      if (!boardId) return [];
      const client = getContractsClient();
      const result = await client.boardActivity.listBoardActivity({ params: { boardId } });
      if (result.status !== 200) throw new Error(`Failed to load board activity (HTTP ${result.status})`);
      return result.body;
    },
    enabled: !!boardId && enabled,
    staleTime: 15_000,
  });

  const recordBoardEvent = useMutation({
    mutationFn: async ({
      type,
      payload,
    }: {
      type: ActivityType;
      payload?: Record<string, unknown>;
    }) => {
      if (!boardId) return;
      const client = getContractsClient();
      await client.boardActivity.recordBoardActivity({
        params: { boardId },
        body: { type, ...(payload ? { payload } : {}) },
      });
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey }),
  });

  return { feedQuery, recordBoardEvent };
}
