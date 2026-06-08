import { type BoardAttachmentEntry } from '@gruenerator/contracts';
import { getContractsClient, getGlobalApiClient } from '@gruenerator/shared/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * Card file attachments. List/delete/cover go through the ts-rest client; upload
 * is multipart so it uses the raw axios client against the plain Express route.
 */
export function useBoardAttachments(boardId: string | undefined, cardId: string) {
  const queryClient = useQueryClient();
  const queryKey = ['board-attachments', boardId, cardId];

  const attachmentsQuery = useQuery({
    queryKey,
    queryFn: async (): Promise<BoardAttachmentEntry[]> => {
      if (!boardId) return [];
      const client = getContractsClient();
      const result = await client.boardAttachments.listAttachments({ params: { boardId, cardId } });
      if (result.status !== 200) throw new Error(`Failed to load attachments`);
      return result.body;
    },
    enabled: !!boardId && !!cardId,
    staleTime: 30_000,
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (!boardId) return;
      const form = new FormData();
      form.append('file', file);
      await getGlobalApiClient().post(
        `/api/board-attachments/${boardId}/cards/${cardId}/upload`,
        form,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey }),
  });

  const remove = useMutation({
    mutationFn: async (attachmentId: string) => {
      if (!boardId) return;
      const client = getContractsClient();
      const result = await client.boardAttachments.deleteAttachment({
        params: { boardId, attachmentId },
        body: {},
      });
      if (result.status !== 200) throw new Error('Delete failed');
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey }),
  });

  const setCover = useMutation({
    mutationFn: async ({ attachmentId, isCover }: { attachmentId: string; isCover: boolean }) => {
      if (!boardId) return;
      const client = getContractsClient();
      const result = await client.boardAttachments.setCover({
        params: { boardId, attachmentId },
        body: { isCover },
      });
      if (result.status !== 200) throw new Error('Set cover failed');
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey }),
  });

  return { attachmentsQuery, upload, remove, setCover };
}
