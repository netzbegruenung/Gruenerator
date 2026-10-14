/**
 * "Deine Werke": all-time counts of what this account created, plus the
 * 365-day activity calendar. Cached server-side for ten minutes.
 */
import { type GetUserActivityResponseDto } from '@gruenerator/contracts';
import { ApiError, getContractsClient } from '@gruenerator/shared/api';
import { useQuery } from '@tanstack/react-query';

/** Shared by the hook and the tab's preload, so both hit the same cache entry. */
export function usageActivityQuery() {
  return {
    queryKey: ['user-usage-activity'] as const,
    queryFn: async (): Promise<GetUserActivityResponseDto> => {
      const result = await getContractsClient().userUsage.getMyActivity();
      if (result.status !== 200)
        throw new ApiError(result.status, 'Aktivitätsdaten konnten nicht geladen werden.');
      return result.body;
    },
    staleTime: 5 * 60 * 1000,
  };
}

export function useUsageActivity() {
  return useQuery(usageActivityQuery());
}
