import { type CommentBlock } from '@gruenerator/contracts';
import { ApiError, getContractsClient } from '@gruenerator/shared/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { withReactionSummaries } from './boardCommentReactions';

export const boardCommentsKey = (boardId: string | undefined, cardId: string) => [
  'board-comments',
  boardId,
  cardId,
];

/**
 * Typed comment thread for a board card (/api/board-comments/*). Covers list,
 * create and delete; reactions go through `useToggleReaction` on the same key. Form-state side effects stay in the
 * component via per-call onSuccess; the hook owns query invalidation.
 */
export function useBoardComments(boardId: string | undefined, cardId: string) {
  const queryClient = useQueryClient();
  const queryKey = boardCommentsKey(boardId, cardId);

  const commentsQuery = useQuery({
    queryKey,
    queryFn: async () => {
      if (!boardId) return [];
      const client = getContractsClient();
      const result = await client.boardComments.listComments({ params: { boardId, cardId } });
      if (result.status !== 200) {
        throw new ApiError(result.status, `Failed to load comments (HTTP ${result.status})`);
      }
      return withReactionSummaries(result.body);
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
        throw new ApiError(result.status, `Failed to add comment (HTTP ${result.status})`);
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
        throw new ApiError(result.status, `Failed to delete comment (HTTP ${result.status})`);
      }
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey }),
  });

  return { commentsQuery, addComment, deleteComment };
}
