import { getContractsClient } from '@gruenerator/shared/api';
import { type UsageMap } from '@gruenerator/shared/utils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

export type ItemUsageType = 'notebook' | 'project';

/**
 * Nutzung je Eintrag als `{ itemId → { useCount, lastUsedAt } }` — dieselbe
 * Abfrage wie im Web (`useItemUsage`), für „Zuletzt" und die Projekt-Sortierung.
 */
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

/**
 * Zählt das Öffnen einer Seite als eine Nutzung (wie im Web), einmal je Id und
 * Mount. Fire-and-forget: ein fehlgeschlagener Eintrag stört die Seite nie.
 */
export function useRecordItemUsage(type: ItemUsageType, itemId: string | null) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!itemId) return;
    void getContractsClient()
      .itemUsage.recordUsage({ body: { type, item_id: itemId } })
      .then(() => queryClient.invalidateQueries({ queryKey: ['item-usage', type] }))
      .catch(() => {});
  }, [type, itemId, queryClient]);
}
