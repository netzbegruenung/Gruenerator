import { getContractsClient } from '@gruenerator/shared/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/** Whether the current user watches the whole board (A9), plus a toggle. */
export function useBoardSubscription(boardId: string | undefined) {
  const queryClient = useQueryClient();
  const queryKey = ['board-subscription', boardId, 'board'];

  const subscriptionQuery = useQuery({
    queryKey,
    queryFn: async () => {
      if (!boardId) return { subscribed: false, count: 0 };
      const client = getContractsClient();
      const result = await client.boardSubscriptions.getBoardSubscription({ params: { boardId } });
      if (result.status !== 200) throw new Error('Failed to load board subscription');
      return result.body;
    },
    enabled: !!boardId,
    staleTime: 30_000,
  });

  const toggle = useMutation({
    mutationFn: async (subscribe: boolean) => {
      if (!boardId) return;
      const client = getContractsClient();
      const result = subscribe
        ? await client.boardSubscriptions.subscribeBoard({ params: { boardId }, body: {} })
        : await client.boardSubscriptions.unsubscribeBoard({ params: { boardId }, body: {} });
      if (result.status !== 200) throw new Error('Board subscription toggle failed');
      return result.body;
    },
    onSuccess: (body) => {
      if (body) queryClient.setQueryData(queryKey, body);
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  return { subscriptionQuery, toggle };
}
