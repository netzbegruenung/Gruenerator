/**
 * The daily "Bäume" budget — one per-user allowance shared by image
 * generation, Grünerator Voice, the DeepL translator and deep research.
 * See `packages/contracts/src/schemas/trees.ts`.
 */
import { type TreeBudgetStatus } from '@gruenerator/contracts';
import { ApiError, getContractsClient } from '@gruenerator/shared/api';
import { useQuery } from '@tanstack/react-query';

import { useAuthStore } from '../stores/authStore';

/** Shared by the hook and a later settings-tab preload, so both hit the same cache entry. */
export function treeBudgetQuery(userId: string | undefined) {
  return {
    queryKey: ['trees', userId] as const,
    queryFn: async (): Promise<TreeBudgetStatus> => {
      const result = await getContractsClient().trees.getMyTrees();
      if (result.status !== 200)
        throw new ApiError(result.status, 'Bäume-Budget konnte nicht geladen werden.');
      return result.body;
    },
    staleTime: 30 * 1000,
  };
}

export function useTreeBudget() {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return useQuery({
    ...treeBudgetQuery(user?.id),
    enabled: !!user && isAuthenticated,
    refetchOnWindowFocus: true,
  });
}
