import { getGlobalApiClient } from '@gruenerator/shared/api';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

export interface RecentThread {
  id: string;
  title: string | null;
  updatedAt: string;
  lastMessage?: {
    content: string;
    role: string;
    created_at: string;
  } | null;
}

export function useRecentThreads(limit = 5) {
  const [threads, setThreads] = useState<RecentThread[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchThreads = useCallback(async () => {
    try {
      const client = getGlobalApiClient();
      const res = await client.get('/chat-service/threads');
      const all: RecentThread[] = res.data || [];
      setThreads(all.slice(0, limit));
    } catch {
      setThreads([]);
    } finally {
      setIsLoading(false);
    }
  }, [limit]);

  useFocusEffect(
    useCallback(() => {
      fetchThreads();
    }, [fetchThreads])
  );

  return { threads, isLoading, refetch: fetchThreads };
}
