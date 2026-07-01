import { getContractsClient } from '@gruenerator/shared/api';
import { type UsageMap } from '@gruenerator/shared/utils';
import { useQuery } from '@tanstack/react-query';

export type ItemUsageType = 'notebook' | 'agent';

// Read-only mirror of web's useItemUsage (apps/web/src/features/usage/useItemUsage.ts).
// Returns a `{ itemId → { useCount, lastUsedAt } }` map for "favourites first"
// ordering of static lists (system notebooks / agents).
export function useItemUsage(type: ItemUsageType) {
  return useQuery({
    queryKey: ['item-usage', type] as const,
    queryFn: async (): Promise<UsageMap> => {
      const res = await getContractsClient().itemUsage.getUsage({ query: { type } });
      if (res.status !== 200) return {};
      const map: Record<string, { useCount: number; lastUsedAt: string | Date }> = {};
      for (const item of res.body.items) {
        map[item.item_id] = { useCount: item.use_count, lastUsedAt: item.last_used_at };
      }
      return map;
    },
    staleTime: 60_000,
  });
}
