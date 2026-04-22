import { useQuery } from '@tanstack/react-query';

import apiClient from '../../../components/utils/apiClient';

export interface AssignableMember {
  user_id: string;
  source: 'owner' | 'direct' | 'group';
  first_name: string | null;
  display_name: string | null;
  avatar_robot_id: number;
}

export function useAssignableMembers(boardId: string | undefined) {
  return useQuery<AssignableMember[]>({
    queryKey: ['boards', boardId, 'assignable-members'],
    queryFn: async () => {
      const res = await apiClient.get<AssignableMember[]>(`/boards/${boardId}/assignable-members`);
      return res.data;
    },
    enabled: !!boardId,
    staleTime: 30_000,
  });
}
