import { type TextForm } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { useQuery } from '@tanstack/react-query';

// Read-only mirror of web's useOwnRecipes (apps/web/src/features/agentura/recipes/api.ts),
// same query key so both surfaces share one cache entry. Mobile only lists and
// opens recipes — creating, editing and sharing stay on web.
const KEY = ['text-forms'] as const;

/**
 * The caller's own recipes. Group-shared rows arrive in the same response and
 * are dropped here: the Agentura shelf they would land in is „Meine Rezepte",
 * and a colleague's recipe under that heading reads as one of your own.
 * Overrides of system recipes (`kind` preset/recipe) are dropped too — they
 * have no mention of their own to type, they replace an official recipe that
 * the „Offizielle" shelf already lists.
 */
export function useOwnRecipes(enabled = true) {
  return useQuery({
    queryKey: KEY,
    enabled,
    queryFn: async (): Promise<TextForm[]> => {
      const res = await getContractsClient().userTextForms.list();
      if (res.status === 200)
        return res.body.forms.filter((f) => f.kind === 'custom' && f.sharedFromGroup === null);
      throw new Error('Deine Rezepte konnten nicht geladen werden.');
    },
  });
}
