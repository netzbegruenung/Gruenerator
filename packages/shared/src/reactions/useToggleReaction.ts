import {
  reactionEmojiSchema,
  type ReactionEntityType,
  type ReactionSummary,
} from '@gruenerator/contracts';
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';

import { apiErrorFromResponse, getContractsClient } from '../api/index.js';

import { applyReaction } from './applyReaction.js';

export interface UseToggleReactionOptions<TData> {
  entityType: ReactionEntityType;
  entityId: string;
  /** The query whose cached data carries this entity's reactions. */
  queryKey: QueryKey;
  /** Returns `data` with this entity's reactions replaced by `apply(current)`. */
  update: (data: TData, apply: (reactions: ReactionSummary[]) => ReactionSummary[]) => TData;
}

interface ToggleVariables {
  emoji: string;
  /** Whether the viewer has this reaction now, i.e. before the toggle. */
  reacted: boolean;
}

export function useToggleReaction<TData>({
  entityType,
  entityId,
  queryKey,
  update,
}: UseToggleReactionOptions<TData>) {
  const queryClient = useQueryClient();
  const scopeId = `${entityType}:${entityId}`;

  // Patches only this entity; other entities in the same query keep their state.
  const patch = (apply: (reactions: ReactionSummary[]) => ReactionSummary[]) =>
    queryClient.setQueryData<TData>(queryKey, (data) =>
      data === undefined ? undefined : update(data, apply)
    );

  const mutation = useMutation<ReactionSummary[], Error, ToggleVariables>({
    mutationKey: ['entity-reaction', ...queryKey],
    // Toggles on one entity reach the server in click order; onMutate still
    // runs immediately, so every click is shown optimistically at once.
    scope: { id: scopeId },
    mutationFn: async ({ emoji, reacted }) => {
      const client = getContractsClient().entityReactions;
      if (reacted) {
        const res = await client.removeReaction({ params: { entityType, entityId, emoji } });
        if (res.status !== 200)
          throw apiErrorFromResponse(res, 'Reaktion konnte nicht entfernt werden.');
        return res.body.reactions;
      }
      const res = await client.addReaction({
        params: { entityType, entityId, emoji: reactionEmojiSchema.parse(emoji) },
      });
      if (res.status !== 200)
        throw apiErrorFromResponse(res, 'Reaktion konnte nicht gespeichert werden.');
      return res.body.reactions;
    },
    onMutate: async ({ emoji, reacted }) => {
      await queryClient.cancelQueries({ queryKey });
      patch((r) => applyReaction(r, emoji, !reacted));
    },
    onSuccess: (reactions) => {
      // A queued toggle on this entity is already applied optimistically; its
      // own response (the last in the scope) carries the final state.
      const inScope = queryClient.isMutating({ predicate: (m) => m.options.scope?.id === scopeId });
      if (inScope > 1) return;
      patch(() => reactions);
    },
    onError: async (_error, { emoji, reacted }) => {
      patch((r) => applyReaction(r, emoji, reacted));
      await queryClient.invalidateQueries({ queryKey });
    },
  });

  const toggle = (emoji: string, reacted: boolean) => {
    // Adding is limited to the fixed set; legacy emojis (💡) can only be removed.
    if (!reacted && !reactionEmojiSchema.safeParse(emoji).success) return;
    mutation.mutate({ emoji, reacted });
  };

  return { toggle, isPending: mutation.isPending };
}
