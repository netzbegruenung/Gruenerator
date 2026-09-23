import {
  type GetTransparencyStatsResponseDto,
  type TransparencyLocale,
} from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { useQuery } from '@tanstack/react-query';

/**
 * Platform-wide consumption and footprint.
 *
 * `staleTime` matches the endpoint's own Redis TTL (15 min, see
 * `apps/api/services/usage/platformUsageStats.ts`): refetching sooner cannot
 * produce a newer number, it only costs a round trip that returns the same
 * cached snapshot. The response carries `generated_at` for exactly this reason
 * — the figure is knowingly older than the request, and the page says so
 * rather than implying it is live.
 *
 * `locale` narrows the figure to one country's users; `null` is the whole
 * instance. The key is omitted rather than sent empty so the bare request stays
 * byte-identical to what it was before the segment existed.
 */
export function useTransparencyStats(days: number, locale: TransparencyLocale | null) {
  return useQuery({
    queryKey: ['monitor', 'transparency', days, locale ?? 'all'],
    queryFn: async (): Promise<GetTransparencyStatsResponseDto> => {
      const res = await getContractsClient().transparency.getTransparencyStats({
        query: locale ? { days, locale } : { days },
      });
      if (res.status === 200) return res.body;
      throw new Error('Transparenzdaten konnten nicht geladen werden.');
    },
    staleTime: 15 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}
