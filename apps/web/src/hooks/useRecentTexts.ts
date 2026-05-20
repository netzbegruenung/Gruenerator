import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import apiClient from '../components/utils/apiClient';

export interface SavedText {
  id: string;
  title: string;
  content: string;
  type: string;
  created_at: string;
  word_count: number;
  character_count: number;
}

export interface UseRecentTextsOptions {
  generatorType: string;
  limit?: number;
  enabled?: boolean;
}

export interface UseRecentTextsReturn {
  texts: SavedText[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  deleteText: (id: string) => Promise<void>;
}

const STALE_TIME = 5 * 60 * 1000;

const recentTextsKey = (generatorType: string, limit: number) =>
  ['saved-texts', generatorType, limit] as const;

export function useRecentTexts(options: UseRecentTextsOptions): UseRecentTextsReturn {
  const { generatorType, limit = 3, enabled = true } = options;
  const queryClient = useQueryClient();
  const queryKey = recentTextsKey(generatorType, limit);

  const query = useQuery<SavedText[], Error>({
    queryKey,
    queryFn: async () => {
      const response = await apiClient.get<{ data: SavedText[] }>('/auth/saved-texts', {
        params: { type: generatorType, limit, page: 1 },
        skipAuthRedirect: true,
      });
      return response.data.data ?? [];
    },
    enabled,
    staleTime: STALE_TIME,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/auth/saved-texts/${id}`);
      return id;
    },
    onSuccess: (id) => {
      queryClient.setQueryData<SavedText[]>(queryKey, (prev) =>
        prev ? prev.filter((t) => t.id !== id) : prev
      );
      void queryClient.invalidateQueries({ queryKey: ['saved-texts', generatorType] });
    },
  });

  const refetch = useCallback(async () => {
    await query.refetch();
  }, [query]);

  const deleteText = useCallback(
    async (id: string) => {
      await deleteMutation.mutateAsync(id);
    },
    [deleteMutation]
  );

  const errorMessage = query.error
    ? query.error instanceof Error
      ? query.error.message
      : 'Fehler beim Laden der Texte'
    : deleteMutation.error
      ? deleteMutation.error instanceof Error
        ? deleteMutation.error.message
        : 'Fehler beim Löschen'
      : null;

  return {
    texts: query.data ?? [],
    isLoading: query.isLoading,
    error: errorMessage,
    refetch,
    deleteText,
  };
}
