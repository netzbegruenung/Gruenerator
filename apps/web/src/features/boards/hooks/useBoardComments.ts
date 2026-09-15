import { type CommentBlock } from '@gruenerator/contracts';
import { apiErrorFromResponse, getContractsClient } from '@gruenerator/shared/api';
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
        throw apiErrorFromResponse(result, 'Failed to load comments');
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
        throw apiErrorFromResponse(result, 'Failed to add comment');
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
        throw apiErrorFromResponse(result, 'Failed to delete comment');
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
          throw apiErrorFromResponse(result, 'Failed to remove reaction');
        }
      } else {
        const result = await client.boardComments.addReaction({
          params: { boardId: boardId!, commentId },
          body: { emoji },
        });
        if (result.status !== 200 && result.status !== 201) {
          throw apiErrorFromResponse(result, 'Failed to add reaction');
        }
      }
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey }),
  });

  return { commentsQuery, addComment, deleteComment, toggleReaction };
}
