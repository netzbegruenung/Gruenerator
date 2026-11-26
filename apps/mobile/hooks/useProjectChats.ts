import { getContractsClient } from '@gruenerator/shared/api';
import { projectChatThreads } from '@gruenerator/shared/groups';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';

const projectChatsKey = (groupId: string) => ['space-chats', groupId] as const;

/**
 * Chats, die in diesem Projekt liegen (`chat_threads.group_id`), neueste zuerst.
 * Wie im Web: die Thread-Liste, clientseitig auf das Projekt zugeschnitten.
 *
 * Ein Chat aus dem Projekt entsteht auf dem Chat-Bildschirm, während die
 * Projektseite im Stack gemountet bleibt — kein Mount, kein Refetch. Deshalb
 * lädt die Liste neu, sobald der Bildschirm wieder den Fokus bekommt (wie
 * `refetchOnMount: 'always'` im Web, #6060). Invalidieren statt `refetch()`:
 * mehrere Leser desselben Schlüssels auf einer Seite lösen so einen Abruf aus.
 */
export function useProjectChats(groupId: string | null | undefined, enabled = true) {
  const queryClient = useQueryClient();
  const active = !!groupId && enabled;
  // Der erste Fokus fällt mit dem Mount zusammen, da lädt die Query ohnehin.
  const focusedBefore = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!active || !groupId) return;
      if (focusedBefore.current) {
        void queryClient.invalidateQueries({ queryKey: projectChatsKey(groupId) });
      }
      focusedBefore.current = true;
    }, [active, groupId, queryClient])
  );

  return useQuery({
    queryKey: projectChatsKey(groupId ?? ''),
    queryFn: async () => {
      const res = await getContractsClient().threads.list({ query: {} });
      if (res.status !== 200) throw new Error('Chats konnten nicht geladen werden.');
      return projectChatThreads(res.body, groupId ?? '');
    },
    enabled: active,
    staleTime: 30_000,
  });
}
