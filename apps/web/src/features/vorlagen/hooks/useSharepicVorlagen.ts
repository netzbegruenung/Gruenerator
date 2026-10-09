import { type SharepicCreatorLocale, type SharepicVorlage } from '@gruenerator/contracts';
import { ApiError, getContractsClient } from '@gruenerator/shared/api';
import { useQuery } from '@tanstack/react-query';

/**
 * The Grünerator-Vorlagen for sharepics of the viewer's country — the server
 * detects it. `land` asks for the other country; the server honours it for
 * instance admins only. The catalogue changes with a deploy, not while
 * someone browses.
 */
export function useSharepicVorlagen(land: SharepicCreatorLocale | null = null) {
  return useQuery({
    queryKey: ['sharepic-vorlagen', land],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<SharepicVorlage[]> => {
      const res = await getContractsClient().sharepicVorlagen.list({
        query: land ? { land } : {},
      });
      if (res.status !== 200) {
        throw new ApiError(
          res.status,
          `Vorlagen konnten nicht geladen werden (HTTP ${res.status}).`
        );
      }
      return res.body.vorlagen;
    },
  });
}
