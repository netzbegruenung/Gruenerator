import { getContractsClient } from '@gruenerator/shared/api';
import { useQuery } from '@tanstack/react-query';

/**
 * Typed board-detail fetch (GET /api/boards/:id). Query key ['boards', id] is a
 * prefix-child of the list key ['boards'], so useBoardsTyped mutations invalidate it.
 */
export function useBoardDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['boards', id],
    queryFn: async () => {
      const client = getContractsClient();
      const result = await client.boards.getBoard({ params: { id: id! } });
      if (result.status !== 200) {
        throw new Error(`Failed to load board (HTTP ${result.status})`);
      }
      return result.body;
    },
    enabled: !!id,
  });
}
