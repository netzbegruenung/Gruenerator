import { getContractsClient } from '@gruenerator/shared/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';

/**
 * Duplicate a board (A2). The server clones the structure (fields/rows/views +
 * description) into a fresh board and returns it + its structure; the caller
 * navigates to the new board, seeding the structure like generateBoard. Also
 * records a board_duplicated event on the source board (notifies its watchers).
 */
export function useDuplicateBoard(boardId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!boardId) throw new Error('Kein Board');
      const client = getContractsClient();
      const result = await client.boards.duplicateBoard({ params: { id: boardId }, body: {} });
      if (result.status !== 201) throw new Error(`Duplizieren fehlgeschlagen (HTTP ${result.status})`);
      // Notify watchers of the source board (fire-and-forget).
      await client.boardActivity
        .recordBoardActivity({ params: { boardId }, body: { type: 'board_duplicated' } })
        .catch(() => undefined);
      return result.body;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['boards'] }),
  });
}
