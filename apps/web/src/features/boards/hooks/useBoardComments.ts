import { type CommentBlock } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * Typed comment thread for a board card (/api/board-comments/*). Covers list,
 * create, delete, and add/remove reaction. Form-state side effects stay in the
 * component via per-call onSuccess; the hook owns query invalidation.
 */
export function useBoardComments(boardId: string | undefined, cardId: string) {
  const queryClient = useQueryClient();
  const queryKey = ['board-comments', boardId, cardId];

  const commentsQuery = useQuery({
    queryKey,
    queryFn: async () => {
      if (!boardId) return [];
      const client = getContractsClient();
      const result = await client.boardComments.listComments({ params: { boardId, cardId } });
      if (result.status !== 200) {
        throw new Error(`Failed to load comments (HTTP ${result.status})`);
      }
      return result.body;
    },
    enabled: !!boardId && !!cardId,
    staleTime: 30_000,
  });

  const addComment = useMutation({
    mutationFn: async ({
      blocks,
      parentId,
      agentId,
    }: {
      blocks: CommentBlock[];
      parentId?: string;
      agentId?: string;
    }) => {
      const client = getContractsClient();
      const result = await client.boardComments.createComment({
        params: { boardId: boardId!, cardId },
        body: {
          blocks,
          ...(parentId !== undefined && { parentId }),
          ...(agentId !== undefined && { agentId }),
        },
      });
      if (result.status !== 201) {
        throw new Error(`Failed to add comment (HTTP ${result.status})`);
      }
      return result.body;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey }),
  });

  const deleteComment = useMutation({
    mutationFn: async (commentId: string) => {
      const client = getContractsClient();
      const result = await client.boardComments.deleteComment({
        params: { boardId: boardId!, commentId },
        body: {},
      });
      if (result.status !== 200) {
        throw new Error(`Failed to delete comment (HTTP ${result.status})`);
      }
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey }),
  });

  const toggleReaction = useMutation({
    mutationFn: async ({
      commentId,
      emoji,
      remove,
    }: {
      commentId: string;
      emoji: string;
      remove: boolean;
    }) => {
      const client = getContractsClient();
      if (remove) {
        const result = await client.boardComments.removeReaction({
          params: { boardId: boardId!, commentId, emoji },
          body: {},
        });
        if (result.status !== 200) {
          throw new Error(`Failed to remove reaction (HTTP ${result.status})`);
        }
      } else {
        const result = await client.boardComments.addReaction({
          params: { boardId: boardId!, commentId },
          body: { emoji },
        });
        if (result.status !== 200 && result.status !== 201) {
          throw new Error(`Failed to add reaction (HTTP ${result.status})`);
        }
      }
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey }),
  });

  return { commentsQuery, addComment, deleteComment, toggleReaction };
}
