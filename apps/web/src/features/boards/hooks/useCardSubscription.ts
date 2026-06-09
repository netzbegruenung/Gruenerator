import { getContractsClient } from '@gruenerator/shared/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/** Whether the current user watches a card, plus a toggle. */
export function useCardSubscription(boardId: string | undefined, cardId: string) {
  const queryClient = useQueryClient();
  const queryKey = ['board-subscription', boardId, cardId];

  const subscriptionQuery = useQuery({
    queryKey,
    queryFn: async () => {
      if (!boardId) return { subscribed: false, count: 0 };
      const client = getContractsClient();
      const result = await client.boardSubscriptions.getSubscription({
        params: { boardId, cardId },
      });
      if (result.status !== 200) throw new Error(`Failed to load subscription`);
      return result.body;
    },
    enabled: !!boardId && !!cardId,
    staleTime: 30_000,
  });

  const toggle = useMutation({
    mutationFn: async (subscribe: boolean) => {
      if (!boardId) return;
      const client = getContractsClient();
      const result = subscribe
        ? await client.boardSubscriptions.subscribe({ params: { boardId, cardId }, body: {} })
        : await client.boardSubscriptions.unsubscribe({ params: { boardId, cardId }, body: {} });
      if (result.status !== 200) throw new Error('Subscription toggle failed');
      return result.body;
    },
    onSuccess: (body) => {
      if (body) queryClient.setQueryData(queryKey, body);
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  return { subscriptionQuery, toggle };
}
