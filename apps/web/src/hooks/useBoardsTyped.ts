/**
 * useBoardsTyped — typed replacement for useBoards mutations.
 *
 * GET /boards (list) and DELETE /boards/:id are NOT in boardsContract —
 * they remain axios-backed. This hook provides typed versions of the
 * 3 contract-modeled mutations: createBoard, updateBoard, generateBoard.
 *
 * The mutation return types are inferred directly from the Zod schemas in
 * @gruenerator/contracts. Since boardDocumentSchema is a structural superset
 * of the local Board interface, consumers can pass returned boards directly
 * to isBoardArchived / getBoardType without casts.
 */

import { getContractsClient } from '@gruenerator/shared/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { type BoardType } from '../features/boards/types';

const BOARDS_QUERY_KEY = ['boards'];

export const useBoardsTyped = () => {
  const queryClient = useQueryClient();

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

  const updateBoard = useMutation({
    mutationFn: async ({
      id,
      title,
      is_archived,
    }: {
      id: string;
      title?: string;
      is_archived?: boolean;
    }) => {
      const client = getContractsClient();
      const result = await client.boards.updateBoard({
        params: { id },
        body: {
          ...(title !== undefined && { title }),
          ...(is_archived !== undefined && { is_archived }),
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

  return {
    createBoard,
    updateBoard,
    generateBoard,
  };
};
