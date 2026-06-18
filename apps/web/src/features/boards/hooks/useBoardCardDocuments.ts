import { type BoardCardDocumentEntry } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * Documents the board agent (@Grünerator) created for a card
 * ("Grünerator-Dokumente"). Listed/unlinked via the ts-rest client. The worker
 * writes new rows to Postgres and bumps the card's comment signal, so an open
 * card refetches live (see useBoardCommentSignal).
 */
export function useBoardCardDocuments(boardId: string | undefined, cardId: string) {
  const queryClient = useQueryClient();
  const queryKey = ['board-card-documents', boardId, cardId];

  const documentsQuery = useQuery({
    queryKey,
    queryFn: async (): Promise<BoardCardDocumentEntry[]> => {
      if (!boardId) return [];
      const client = getContractsClient();
      const result = await client.boardCardDocuments.listCardDocuments({
        params: { boardId, cardId },
      });
      if (result.status !== 200) throw new Error('Failed to load card documents');
      return result.body;
    },
    enabled: !!boardId && !!cardId,
    staleTime: 30_000,
  });

  const unlink = useMutation({
    mutationFn: async (linkId: string) => {
      if (!boardId) return;
      const client = getContractsClient();
      const result = await client.boardCardDocuments.unlinkCardDocument({
        params: { boardId, linkId },
        body: {},
      });
      if (result.status !== 200) throw new Error('Unlink failed');
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey }),
  });

  return { documentsQuery, unlink };
}
