import { type AssignableMember } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { useQuery } from '@tanstack/react-query';

export type { AssignableMember };

export function useAssignableMembers(boardId: string | undefined) {
  return useQuery<AssignableMember[]>({
    queryKey: ['boards', boardId, 'assignable-members'],
    queryFn: async () => {
      const client = getContractsClient();
      const result = await client.boards.getAssignableMembers({ params: { id: boardId! } });
      if (result.status !== 200) {
        throw new Error(`Failed to load assignable members (HTTP ${result.status})`);
      }
      return result.body;
    },
    enabled: !!boardId,
    staleTime: 30_000,
  });
}
