import { type ActivityType } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * Per-card activity timeline. `record` is used by mutation call sites (after a Yjs
 * edit) to log a semantic event; it is fire-and-forget and invalidates the feed.
 */
export function useBoardActivity(boardId: string | undefined, cardId: string) {
  const queryClient = useQueryClient();
  const queryKey = ['board-activity', boardId, cardId];

  const activityQuery = useQuery({
    queryKey,
    queryFn: async () => {
      if (!boardId) return [];
      const client = getContractsClient();
      const result = await client.boardActivity.listActivity({ params: { boardId, cardId } });
      if (result.status !== 200) throw new Error(`Failed to load activity (HTTP ${result.status})`);
      return result.body;
    },
    enabled: !!boardId && !!cardId,
    staleTime: 30_000,
  });

  const record = useMutation({
    mutationFn: async ({
      type,
      payload,
    }: {
      type: ActivityType;
      payload?: Record<string, unknown>;
    }) => {
      if (!boardId) return;
      const client = getContractsClient();
      await client.boardActivity.recordActivity({
        params: { boardId, cardId },
        body: { type, ...(payload ? { payload } : {}) },
      });
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey }),
  });

  return { activityQuery, record };
}
