import { type AdminStatsQuery, type GetAdminStatsResponseDto } from '@gruenerator/contracts';
import { ApiError, getContractsClient } from '@gruenerator/shared/api';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

async function fetchAdminStats(query: AdminStatsQuery): Promise<GetAdminStatsResponseDto> {
  const result = await getContractsClient().adminStats.getStats({ query });
  if (result.status !== 200) {
    throw new ApiError(result.status, `Failed to fetch admin statistics (HTTP ${result.status})`);
  }
  return result.body;
}

/** The server caches for 15 minutes; refetching sooner shows nothing new. */
export function useAdminStats(query: AdminStatsQuery) {
  return useQuery({
    queryKey: ['admin-stats', query],
    queryFn: () => fetchAdminStats(query),
    staleTime: 15 * 60_000,
    placeholderData: keepPreviousData,
  });
}
