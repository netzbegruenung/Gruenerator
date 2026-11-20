import { getContractsClient } from '@gruenerator/shared/api';
import { projectChatThreads } from '@gruenerator/shared/groups';
import { useQuery } from '@tanstack/react-query';

/**
 * Chats, die in diesem Projekt liegen (`chat_threads.group_id`), neueste zuerst.
 * Wie im Web: die Thread-Liste, clientseitig auf das Projekt zugeschnitten.
 */
export function useProjectChats(groupId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ['space-chats', groupId ?? ''],
    queryFn: async () => {
      const res = await getContractsClient().threads.list({ query: {} });
      if (res.status !== 200) throw new Error('Chats konnten nicht geladen werden.');
      return projectChatThreads(res.body, groupId ?? '');
    },
    enabled: !!groupId && enabled,
    staleTime: 30_000,
  });
}
