import { type SharepicVorlage } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { useQuery } from '@tanstack/react-query';

// Same key as web's `useSharepicVorlagen`. The server picks the country from
// the profile, so there is no locale in the key and no switch.
const KEY = ['sharepic-vorlagen'] as const;

export function useSharepicVorlagen() {
  return useQuery({
    queryKey: KEY,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<SharepicVorlage[]> => {
      const res = await getContractsClient().sharepicVorlagen.list();
      if (res.status === 200) return res.body.vorlagen;
      throw new Error('Vorlagen konnten nicht geladen werden.');
    },
  });
}
