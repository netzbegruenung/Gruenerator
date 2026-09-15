import { apiErrorFromResponse, getContractsClient } from '@gruenerator/shared/api';
import { useQuery } from '@tanstack/react-query';

/**
 * Typed public-board lookup (GET /api/boards/public/:id, no auth). The response is
 * a union: an 'authenticated' stub or the full public payload — narrow on share_mode.
 */
export function usePublicBoard(id: string | undefined) {
  return useQuery({
    queryKey: ['boards-public', id],
    queryFn: async () => {
      const client = getContractsClient();
      const result = await client.publicBoards.getPublicBoard({ params: { id: id! } });
      if (result.status !== 200) {
        throw apiErrorFromResponse(result, 'Board not publicly accessible');
      }
      return result.body;
    },
    enabled: !!id,
    retry: false,
  });
}
