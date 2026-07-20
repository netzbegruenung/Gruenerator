import { getContractsClient } from '@gruenerator/shared/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useOptimizedAuth } from '../../hooks/useAuth';

export interface ChatFolder {
  id: string;
  userId: string;
  name: string;
  parentId: string | null;
  sort: number;
  createdAt: string;
}

export interface FolderThread {
  id: string;
  title: string | null;
  slugSuffix: string | null;
  agentId: string;
  updatedAt: string;
}

const FOLDERS_KEY = ['chat-thread-folders'] as const;
const THREADS_KEY = ['chat-threads-for-folders'] as const;

export function useFolders() {
  const { user, isAuthenticated, loading: authLoading } = useOptimizedAuth();
  return useQuery({
    queryKey: FOLDERS_KEY,
    enabled: !!user?.id && isAuthenticated && !authLoading,
    queryFn: async (): Promise<ChatFolder[]> => {
      const res = await getContractsClient().chatThreadFolders.list();
      if (res.status === 200) return res.body;
      throw new Error('Ordner konnten nicht geladen werden.');
    },
  });
}

/** All of the user's threads, used to derive per-folder thread lists client-side. */
export function useAllThreads() {
  const { user, isAuthenticated, loading: authLoading } = useOptimizedAuth();
  return useQuery({
    queryKey: THREADS_KEY,
    enabled: !!user?.id && isAuthenticated && !authLoading,
    queryFn: async () => {
      const res = await getContractsClient().threads.list({ query: {} });
      if (res.status === 200) return res.body;
      throw new Error('Chats konnten nicht geladen werden.');
    },
  });
}

export function useThreadsInFolder(folderId: string | undefined) {
  const all = useAllThreads();
  const threads: FolderThread[] = (all.data ?? [])
    .filter((t) => folderId && t.folderId === folderId && t.status !== 'archived')
    .map((t) => ({
      id: t.id,
      title: t.title,
      slugSuffix: t.slugSuffix,
      agentId: t.agentId,
      updatedAt: t.updatedAt,
    }));
  return { ...all, threads };
}

export function useCreateFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string): Promise<ChatFolder> => {
      const res = await getContractsClient().chatThreadFolders.create({ body: { name } });
      if (res.status === 201) return res.body;
      throw new Error('Ordner konnte nicht erstellt werden.');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: FOLDERS_KEY }),
  });
}

export function useRenameFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }): Promise<ChatFolder> => {
      const res = await getContractsClient().chatThreadFolders.update({
        params: { id },
        body: { name },
      });
      if (res.status === 200) return res.body;
      throw new Error('Ordner konnte nicht umbenannt werden.');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: FOLDERS_KEY }),
  });
}

export function useDeleteFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const res = await getContractsClient().chatThreadFolders.delete({ params: { id } });
      if (res.status !== 200) throw new Error('Ordner konnte nicht gelöscht werden.');
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: FOLDERS_KEY });
      void qc.invalidateQueries({ queryKey: THREADS_KEY });
    },
  });
}
