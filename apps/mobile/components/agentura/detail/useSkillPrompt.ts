import { ApiError, getContractsClient } from '@gruenerator/shared/api';
import { useQuery } from '@tanstack/react-query';

/**
 * Der Anleitungstext eines Katalog-Rezepts. Er steht absichtlich nicht im
 * Bundle (parteiintern, siehe `apps/api/services/skills/internalPrompts.ts`),
 * sondern kommt angemeldet von der API — wie `useSkillPrompt` im Web, mit
 * demselben Query-Key. `null` heißt: auf diesem Host gibt es keinen Text.
 */
export function useSkillPrompt(mention: string | null) {
  return useQuery({
    queryKey: ['skill', 'prompt', mention ?? '_'],
    enabled: Boolean(mention),
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: async (): Promise<string | null> => {
      const result = await getContractsClient().skillPrompt.getPrompt({
        params: { mention: mention as string },
      });
      if (result.status !== 200) {
        throw new ApiError(result.status, `Failed to fetch skill prompt (HTTP ${result.status})`);
      }
      return result.body.prompt;
    },
  });
}
