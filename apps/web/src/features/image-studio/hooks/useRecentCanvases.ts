import { type CanvasListItem } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

/**
 * Canvases owned by, shared with, or group-shared to the caller. staleTime 0
 * (instead of the 5-min app default) so a canvas minted moments ago appears
 * when the user navigates back to /studio.
 */
export const useRecentCanvases = (enabled: boolean): UseQueryResult<CanvasListItem[]> =>
  useQuery<CanvasListItem[]>({
    queryKey: ['canvas', 'list'],
    queryFn: async () => {
      const result = await getContractsClient().canvas.list();
      if (result.status !== 200) {
        throw new Error(`Failed to list canvases (HTTP ${result.status})`);
      }
      return result.body;
    },
    enabled,
    staleTime: 0,
    meta: { silent: true },
  });
