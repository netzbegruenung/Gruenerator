import { getContractsClient } from '@gruenerator/shared/api';
import { useQuery } from '@tanstack/react-query';

/**
 * The prompt body of a system skill, fetched instead of read from `SKILLS`.
 *
 * The catalogue in the bundle is metadata-only on purpose — a prompt field
 * there would be readable by anyone who opens the JS chunk, logged in or not.
 * See apps/api/services/skills/internalPrompts.ts.
 *
 * `null` data is the expected answer on a host without the internal directory
 * (fork, fresh clone, failed rollout), not an error — callers fall back to the
 * skill's public description.
 */
export function useSkillPrompt(mention: string | undefined) {
  return useQuery({
    queryKey: ['skill', 'prompt', mention ?? '_'],
    enabled: Boolean(mention),
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: async (): Promise<string | null> => {
      const client = getContractsClient();
      const result = await client.skillPrompt.getPrompt({ params: { mention: mention as string } });
      if (result.status !== 200) {
        throw new Error(`Failed to fetch skill prompt (HTTP ${result.status})`);
      }
      return result.body.prompt;
    },
  });
}
