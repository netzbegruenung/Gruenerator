import { type PopularVorlage } from '@gruenerator/contracts';
import { ApiError, getContractsClient } from '@gruenerator/shared/api';
import { useQuery } from '@tanstack/react-query';

/** The most liked Grünerator-Vorlagen of the viewer's country, catalogue order as fallback. */
export function usePopularVorlagen(limit: number) {
  return useQuery({
    queryKey: ['vorlagen-popular', limit],
    staleTime: 60_000,
    queryFn: async (): Promise<PopularVorlage[]> => {
      const res = await getContractsClient().templateInteractions.listPopularVorlagen({
        query: { limit },
      });
      if (res.status !== 200) {
        throw new ApiError(res.status, 'Beliebte Vorlagen konnten nicht geladen werden.');
      }
      return res.body.items;
    },
  });
}
