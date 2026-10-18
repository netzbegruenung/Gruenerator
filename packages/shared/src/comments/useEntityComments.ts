/**
 * Comments and reactions on a marketplace item (Agent, Rezept, Vorlage,
 * Sticker, Hintergrund), keyed like likes: `(type, id)` with `id` = the item's
 * marketplace `ref`. One query carries the comments and the item's own
 * reactions; the toggle hooks patch that cache optimistically.
 */
import {
  type EntityComment,
  type EntityCommentType,
  type ReactionSummary,
} from '@gruenerator/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiErrorFromResponse, getContractsClient } from '../api/index.js';
import { useToggleReaction } from '../reactions/useToggleReaction.js';

export interface EntityDiscussion {
  /** Reactions on the item itself. */
  reactions: ReactionSummary[];
  comments: EntityComment[];
}

type ApplyReactions = (reactions: ReactionSummary[]) => ReactionSummary[];

export const entityCommentsKey = (type: EntityCommentType, id: string) =>
  ['entity-comments', type, id] as const;

export const useEntityComments = (type: EntityCommentType, id: string | null) =>
  useQuery({
    queryKey: entityCommentsKey(type, id ?? ''),
    enabled: !!id,
    queryFn: async (): Promise<EntityDiscussion> => {
      const res = await getContractsClient().entityComments.listEntityComments({
        params: { entityType: type, entityId: id! },
      });
      if (res.status !== 200)
        throw apiErrorFromResponse(res, 'Kommentare konnten nicht geladen werden.');
      return { reactions: res.body.reactions, comments: res.body.comments };
    },
  });

export const useAddEntityComment = (type: EntityCommentType, id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { body: string; parentId?: string }) => {
      const res = await getContractsClient().entityComments.createEntityComment({
        params: { entityType: type, entityId: id },
        body: input,
      });
      if (res.status !== 201)
        throw apiErrorFromResponse(res, 'Kommentar konnte nicht gesendet werden.');
      return res.body.comment;
    },
    onSuccess: (comment) => {
      qc.setQueryData<EntityDiscussion>(entityCommentsKey(type, id), (prev) =>
        prev ? { ...prev, comments: [...prev.comments, comment] } : prev
      );
    },
  });
};

export const useDeleteEntityComment = (type: EntityCommentType, id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (commentId: string) => {
      const res = await getContractsClient().entityComments.deleteEntityComment({
        params: { entityType: type, entityId: id, commentId },
      });
      if (res.status !== 200)
        throw apiErrorFromResponse(res, 'Kommentar konnte nicht gelöscht werden.');
      return commentId;
    },
    onSuccess: (commentId) => {
      qc.setQueryData<EntityDiscussion>(entityCommentsKey(type, id), (prev) =>
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

const patchItemReactions = (data: EntityDiscussion, apply: ApplyReactions): EntityDiscussion => ({
  ...data,
  reactions: apply(data.reactions),
});

const patchCommentReactions = (
  data: EntityDiscussion,
  commentId: string,
  apply: ApplyReactions
): EntityDiscussion => ({
  ...data,
  comments: data.comments.map((c) =>
    c.id === commentId ? { ...c, reactions: apply(c.reactions) } : c
  ),
});

/** Toggle the viewer's reaction on the item itself. */
export const useToggleItemReaction = (type: EntityCommentType, id: string) =>
  useToggleReaction<EntityDiscussion>({
    entityType: 'marketplace_item',
    entityId: id,
    itemType: type,
    queryKey: entityCommentsKey(type, id),
    update: patchItemReactions,
  });

/** Toggle the viewer's reaction on one comment of the item. */
export const useToggleCommentReaction = (comment: EntityComment) =>
  useToggleReaction<EntityDiscussion>({
    entityType: 'entity_comment',
    entityId: comment.id,
    queryKey: entityCommentsKey(comment.entityType, comment.entityId),
    update: (data, apply) => patchCommentReactions(data, comment.id, apply),
  });
