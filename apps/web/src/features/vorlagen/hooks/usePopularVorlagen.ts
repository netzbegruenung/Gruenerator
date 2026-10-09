import { type PopularVorlage } from '@gruenerator/contracts';
import { ApiError, getContractsClient } from '@gruenerator/shared/api';
import { useQuery } from '@tanstack/react-query';

/** The gallery id a popular entry is liked, bookmarked and reacted under. */
export const popularVorlageId = (p: PopularVorlage): string =>
  p.kind === 'catalog' ? p.vorlage.id : String(p.template.id);

/**
 * The most liked/reacted Vorlagen of every kind the viewer can see, mixed;
 * the server fills up with the newest while there are not enough likes.
 */
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
