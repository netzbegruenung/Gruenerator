import {
  type AgentComment,
  type AgentCommentsResponse,
  type ReactionSummary,
} from '@gruenerator/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiErrorFromResponse, getContractsClient } from '../api/index.js';

/** Comments plus the reactions on the agent itself — one query per agent. */
export interface AgentDiscussion {
  reactions: ReactionSummary[];
  comments: AgentComment[];
}

type ApplyReactions = (reactions: ReactionSummary[]) => ReactionSummary[];

export const agentCommentsKey = (agentId: string) => ['agent-comments', agentId] as const;

export const patchAgentReactions = (data: AgentDiscussion, apply: ApplyReactions) => ({
  ...data,
  reactions: apply(data.reactions),
});

export const patchAgentCommentReactions = (
  data: AgentDiscussion,
  commentId: string,
  apply: ApplyReactions
): AgentDiscussion => ({
  ...data,
  comments: data.comments.map((c) =>
    c.id === commentId ? { ...c, reactions: apply(c.reactions) } : c
  ),
});

export const useAgentComments = (agentId: string | undefined) =>
  useQuery({
    queryKey: agentCommentsKey(agentId ?? ''),
    enabled: !!agentId,
    queryFn: async (): Promise<AgentDiscussion> => {
      const res = await getContractsClient().agentComments.listAgentComments({
        params: { agentId: agentId! },
      });
      if (res.status !== 200)
        throw apiErrorFromResponse(res, 'Kommentare konnten nicht geladen werden.');
      const { reactions, comments }: AgentCommentsResponse = res.body;
      return { reactions, comments };
    },
  });

export const useAddAgentComment = (agentId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { body: string; parentId?: string }) => {
      const res = await getContractsClient().agentComments.createAgentComment({
        params: { agentId },
        body: input,
      });
      if (res.status !== 201)
        throw apiErrorFromResponse(res, 'Kommentar konnte nicht gesendet werden.');
      return res.body.comment;
    },
    onSuccess: (comment) => {
      qc.setQueryData<AgentDiscussion>(agentCommentsKey(agentId), (prev) =>
        prev ? { ...prev, comments: [...prev.comments, comment] } : prev
      );
    },
  });
};

export const useDeleteAgentComment = (agentId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (commentId: string) => {
      const res = await getContractsClient().agentComments.deleteAgentComment({
        params: { agentId, commentId },
      });
      if (res.status !== 200)
        throw apiErrorFromResponse(res, 'Kommentar konnte nicht gelöscht werden.');
      return commentId;
    },
    onSuccess: (commentId) => {
      qc.setQueryData<AgentDiscussion>(agentCommentsKey(agentId), (prev) =>
        prev
          ? {
              ...prev,
              comments: prev.comments
                .filter((c) => c.id !== commentId)
                .map((c) => (c.parentId === commentId ? { ...c, parentId: null } : c)),
            }
          : prev
      );
    },
  });
};
