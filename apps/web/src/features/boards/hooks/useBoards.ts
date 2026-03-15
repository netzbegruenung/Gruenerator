import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import apiClient from '../../../components/utils/apiClient';
import { type Board, type BoardType, isBoardArchived } from '../types';

const BOARDS_QUERY_KEY = ['boards'];

export const useBoards = (options?: { enabled?: boolean }) => {
  const queryClient = useQueryClient();

  const boardsQuery = useQuery<Board[]>({
    queryKey: BOARDS_QUERY_KEY,
    queryFn: async () => {
      const response = await apiClient.get('/boards');
      return response.data;
    },
    enabled: options?.enabled,
  });

  const createBoard = useMutation({
    mutationFn: async ({ title, boardType }: { title: string; boardType?: BoardType }) => {
      const response = await apiClient.post('/boards', { title, boardType });
      return response.data as Board;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BOARDS_QUERY_KEY });
    },
  });

  const deleteBoard = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/boards/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BOARDS_QUERY_KEY });
    },
  });

  const updateBoard = useMutation({
    mutationFn: async ({ id, ...data }: { id: string; title?: string; is_archived?: boolean }) => {
      const response = await apiClient.put(`/boards/${id}`, data);
      return response.data as Board;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BOARDS_QUERY_KEY });
    },
  });

  const generateBoard = useMutation({
    mutationFn: async (description: string) => {
      const response = await apiClient.post('/boards/generate', { description });
      return response.data as {
        board: Board;
        generatedStructure: { fields: unknown[]; rows: unknown[]; views: unknown[] } | null;
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BOARDS_QUERY_KEY });
    },
  });

  const activeBoards = (boardsQuery.data ?? []).filter((b) => !isBoardArchived(b));
  const archivedBoards = (boardsQuery.data ?? []).filter((b) => isBoardArchived(b));

  return {
    boards: activeBoards,
    archivedBoards,
    allBoards: boardsQuery.data ?? [],
    isLoading: boardsQuery.isLoading,
    error: boardsQuery.error,
    createBoard,
    deleteBoard,
    updateBoard,
    generateBoard,
  };
};
