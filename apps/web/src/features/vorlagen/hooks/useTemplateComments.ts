import { type TemplateComment } from '@gruenerator/contracts';
import { apiErrorFromResponse, getContractsClient } from '@gruenerator/shared/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export const templateCommentsKey = (templateId: string) => ['template-comments', templateId] as const;

export const useTemplateComments = (templateId: string) =>
  useQuery({
    queryKey: templateCommentsKey(templateId),
    queryFn: async (): Promise<TemplateComment[]> => {
      const res = await getContractsClient().templateComments.listTemplateComments({
        params: { templateId },
      });
      if (res.status !== 200)
        throw apiErrorFromResponse(res, 'Kommentare konnten nicht geladen werden.');
      return res.body.comments;
    },
  });

export const useAddTemplateComment = (templateId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { body: string; parentId?: string }) => {
      const res = await getContractsClient().templateComments.createTemplateComment({
        params: { templateId },
        body: input,
      });
      if (res.status !== 201)
        throw apiErrorFromResponse(res, 'Kommentar konnte nicht gesendet werden.');
      return res.body.comment;
    },
    onSuccess: (comment) => {
      qc.setQueryData<TemplateComment[]>(templateCommentsKey(templateId), (prev) =>
        prev ? [...prev, comment] : prev
      );
    },
  });
};

export const useDeleteTemplateComment = (templateId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (commentId: string) => {
      const res = await getContractsClient().templateComments.deleteTemplateComment({
        params: { templateId, commentId },
      });
      if (res.status !== 200)
        throw apiErrorFromResponse(res, 'Kommentar konnte nicht gelöscht werden.');
      return commentId;
    },
    onSuccess: (commentId) => {
      qc.setQueryData<TemplateComment[]>(templateCommentsKey(templateId), (prev) =>
        prev
          ?.filter((c) => c.id !== commentId)
          .map((c) => (c.parentId === commentId ? { ...c, parentId: null } : c))
      );
    },
  });
};
