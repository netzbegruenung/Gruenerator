import { enabledModelIdsFromPreferences } from '@gruenerator/chat';
import { getContractsClient } from '@gruenerator/shared/api';
import { type TextModelId } from '@gruenerator/shared/models';
import { useQuery } from '@tanstack/react-query';

// Nur lesend: die Auswahl stellt man im Web ein. Derselbe Schlüssel wie Webs
// `useModelPreferences`, damit ein Cache nie zwei Formen trägt.
const KEY = ['model-preferences'] as const;

/**
 * Die Modelle, die die Person freigeschaltet hat — `null`, solange nichts
 * geladen ist oder die Anfrage scheitert; dann gilt der Katalog-Standard.
 */
export function useEnabledModelIds(): ReadonlySet<TextModelId> | null {
  const { data } = useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const res = await getContractsClient().modelPreferences.getPreferences();
      if (res.status === 200) return res.body;
      throw new Error('Modell-Einstellungen konnten nicht geladen werden.');
    },
    staleTime: 60_000,
    select: (body) => enabledModelIdsFromPreferences(body.preferences),
  });
  return data ?? null;
}
