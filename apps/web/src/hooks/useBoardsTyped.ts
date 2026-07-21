/**
 * useBoardsTyped — typed replacement for useBoards.
 *
 * Covers all endpoints in boardsContract:
 *   GET  /api/boards          (list)
 *   POST /api/boards/generate (generate)
 *   POST /api/boards          (create)
 *   PUT  /api/boards/:id      (update)
 *   DELETE /api/boards/:id    (delete)
 *
 * The return shape is a structural superset of the legacy useBoards hook so
 * all consumers can drop-in replace `useBoards` with `useBoardsTyped`.
 */

import { getContractsClient } from '@gruenerator/shared/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { isBoardArchived, type BoardType } from '../features/boards/types';

const BOARDS_QUERY_KEY = ['boards'];

export const useBoardsTyped = (options?: { enabled?: boolean }) => {
  const queryClient = useQueryClient();

  const boardsQuery = useQuery({
    queryKey: BOARDS_QUERY_KEY,
    queryFn: async () => {
      const client = getContractsClient();
      const result = await client.boards.listBoards();
      // ts-rest types the 200 body as Board[] but does not runtime-validate it;
      // a proxy/legacy backend answering 200 with an error object would
      // otherwise crash every `.filter` consumer (and the Sidebar's
      // ErrorBoundary takes the whole page down with it).
      if (result.status !== 200 || !Array.isArray(result.body)) {
        throw new Error(`Failed to list boards (HTTP ${result.status})`);
      }
      return result.body;
    },
    enabled: options?.enabled,
  });

  const createBoard = useMutation({
    mutationFn: async ({ title, boardType }: { title?: string; boardType?: BoardType }) => {
      const client = getContractsClient();
      const result = await client.boards.createBoard({
        body: {
          ...(title !== undefined && { title }),
          ...(boardType !== undefined && { boardType }),
        },
      });
      if (result.status !== 201) {
        throw new Error(`Failed to create board (HTTP ${result.status})`);
      }
      return result.body;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: BOARDS_QUERY_KEY });
    },
  });

  const deleteBoard = useMutation({
    mutationFn: async (id: string) => {
      const client = getContractsClient();
      const result = await client.boards.deleteBoard({
        params: { id },
        body: {},
      });
      if (result.status !== 200) {
        throw new Error(`Failed to delete board (HTTP ${result.status})`);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: BOARDS_QUERY_KEY });
    },
  });

  const updateBoard = useMutation({
    mutationFn: async ({
      id,
      title,
      is_archived,
      description,
    }: {
      id: string;
      title?: string;
      is_archived?: boolean;
      description?: string | null;
    }) => {
      const client = getContractsClient();
      const result = await client.boards.updateBoard({
        params: { id },
        body: {
          ...(title !== undefined && { title }),
          ...(is_archived !== undefined && { is_archived }),
          ...(description !== undefined && { description }),
        },
      });
      if (result.status !== 200) {
        throw new Error(`Failed to update board (HTTP ${result.status})`);
      }
      return result.body;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: BOARDS_QUERY_KEY });
    },
  });

  const generateBoard = useMutation({
    mutationFn: async (description: string) => {
      const client = getContractsClient();
      const result = await client.boards.generateBoard({
        body: { description },
      });
      if (result.status !== 201) {
        throw new Error(`Failed to generate board (HTTP ${result.status})`);
      }
      return result.body;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: BOARDS_QUERY_KEY });
    },
  });

  const allBoards = boardsQuery.data ?? [];
  const activeBoards = allBoards.filter((b) => !isBoardArchived(b));
  const archivedBoards = allBoards.filter((b) => isBoardArchived(b));

  return {
    // query state
    boardsQuery,
    boards: activeBoards,
    archivedBoards,
    allBoards,
    isLoading: boardsQuery.isLoading,
    error: boardsQuery.error,
    // mutations
    createBoard,
    deleteBoard,
    updateBoard,
    generateBoard,
  };
};
