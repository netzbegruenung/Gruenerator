import { getContractsClient } from '@gruenerator/shared/api';
import { type UsageMap } from '@gruenerator/shared/utils';
import { useQuery } from '@tanstack/react-query';

import { useOptimizedAuth } from '../../hooks/useAuth';

export type ItemUsageType = 'notebook' | 'agent';

/**
 * Fetches the current user's usage aggregate for one item type as a
 * `{ itemId → { useCount, lastUsedAt } }` map, ready to feed `sortByUsage`.
 * Powers "favourites first" ordering of static client lists (system notebooks
 * / agents). Server-sorted lists (user notebooks / agents) don't need this.
 */
export function useItemUsage(type: ItemUsageType) {
  const { user, isAuthenticated, loading: authLoading } = useOptimizedAuth();
  return useQuery({
    queryKey: ['item-usage', type] as const,
    // Gate on resolved auth: the sidebar mounts before the auth bootstrap
    // finishes, and an ungated query 401s during the login redirect.
    enabled: !!user?.id && isAuthenticated && !authLoading,
    queryFn: async (): Promise<UsageMap> => {
      const res = await getContractsClient().itemUsage.getUsage({ query: { type } });
      if (res.status !== 200) return {};
      const map: Record<string, { useCount: number; lastUsedAt: string | Date }> = {};
      for (const item of res.body.items) {
        map[item.item_id] = { useCount: item.use_count, lastUsedAt: item.last_used_at };
      }
      return map;
    },
    // Ordering rarely changes within a session; avoid refetch churn.
    staleTime: 60_000,
  });
}
