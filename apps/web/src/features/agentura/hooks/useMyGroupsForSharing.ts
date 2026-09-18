/**
 * The "my groups" dropdown shared across Agentura share dialogs (agents,
 * recipes). Wraps the neutral notebook endpoint (`notebookSharing.listMyGroups`)
 * — there is one canonical groups-of-mine route, not one per content type.
 *
 * Hoisted out of `useAgentSharing.ts` so `useRecipeSharing.ts` can reuse it
 * without importing agent-sharing internals.
 */
import { type NotebookUserGroup } from '@gruenerator/contracts';
import { ApiError, getContractsClient } from '@gruenerator/shared/api';
import { useQuery } from '@tanstack/react-query';

const MY_GROUPS_KEY = ['notebook', 'share', 'my-groups']; // shared endpoint

export function useMyGroupsForSharing(enabled: boolean) {
  return useQuery({
    queryKey: MY_GROUPS_KEY,
    enabled,
    retry: false,
    queryFn: async (): Promise<NotebookUserGroup[]> => {
      const client = getContractsClient();
      const result = await client.notebookSharing.listMyGroups({});
      if (result.status !== 200) {
        throw new ApiError(result.status, `Failed to fetch user groups (HTTP ${result.status})`);
      }
      return result.body;
    },
  });
}
