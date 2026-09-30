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

type Snapshot<TData> = { data: TData } | null;

export function useToggleReaction<TData>({
  entityType,
  entityId,
  queryKey,
  update,
}: UseToggleReactionOptions<TData>) {
  const queryClient = useQueryClient();
  const mutationKey = ['entity-reaction', ...queryKey];

  const mutation = useMutation<ReactionSummary[], Error, ToggleVariables, Snapshot<TData>>({
    mutationKey,
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
      const previous = queryClient.getQueryData<TData>(queryKey);
      if (previous === undefined) return null;
      queryClient.setQueryData<TData>(
        queryKey,
        update(previous, (r) => applyReaction(r, emoji, !reacted))
      );
      return { data: previous };
    },
    onError: (_error, _variables, snapshot) => {
      if (snapshot) queryClient.setQueryData<TData>(queryKey, snapshot.data);
    },
    onSettled: async () => {
      // With several toggles in flight, the first refetch would briefly undo
      // the optimistic state of the later ones — only the last one refetches.
      if (queryClient.isMutating({ mutationKey }) > 1) return;
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
