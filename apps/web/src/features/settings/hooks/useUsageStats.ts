/**
 * Personal AI consumption statistics for the "Nutzung" settings tab.
 *
 * Backed by the daily aggregate the API writes for every model call, so the
 * numbers move within one flush interval (~15s) of the last request.
 */
import { type GetUserUsageResponseDto } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { useQuery } from '@tanstack/react-query';

export function useUsageStats(days: number) {
  return useQuery({
    queryKey: ['user-usage', days] as const,
    queryFn: async (): Promise<GetUserUsageResponseDto> => {
      const result = await getContractsClient().userUsage.getMyUsage({ query: { days } });
      if (result.status !== 200) throw new Error('Nutzungsdaten konnten nicht geladen werden.');
      return result.body;
    },
    staleTime: 60 * 1000,
  });
}
