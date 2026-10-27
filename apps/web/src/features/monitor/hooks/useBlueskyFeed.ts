import { getContractsClient } from '@gruenerator/shared/api';
import { useQuery } from '@tanstack/react-query';

import type { BlueskyPost, MonitorLocale } from '@gruenerator/contracts';

export type { BlueskyPost };

export function useBlueskyFeed(locale: MonitorLocale) {
  return useQuery({
    queryKey: ['monitor', 'bluesky', locale],
    queryFn: async (): Promise<BlueskyPost[]> => {
      const res = await getContractsClient().monitor.bluesky({ query: { locale } });
      if (res.status === 200) return res.body;
      throw new Error('Bluesky-Beiträge konnten nicht geladen werden.');
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}
