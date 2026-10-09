import { useCallback } from 'react';

import { type VorlagenCardProps } from '../../../components/common/Gallery/VorlagenCard';
import { useEntityFavorites } from '../../favorites/hooks/useEntityFavorites';
import { useEntityLikes } from '../../likes/hooks/useEntityLikes';
import { TemplateReactions } from '../components/TemplateReactions';

import { useTemplateEngagement } from './useTemplateEngagement';

type InteractionProps = Pick<
  VorlagenCardProps,
  | 'liked'
  | 'onToggleLike'
  | 'likeToggling'
  | 'favorited'
  | 'onToggleFavorite'
  | 'favoriteToggling'
  | 'footer'
>;

/**
 * Like, Merken and emoji reactions for a set of Vorlagen cards — the same for
 * user templates and Grünerator catalogue entries. `likesCount` falls back to
 * what the list itself carried until the engagement query has answered.
 */
export function useVorlageInteractions(ids: readonly string[]) {
  const { likedIds, toggleLike, isToggling: isLikeToggling, canLike } = useEntityLikes('template');
  const {
    favoritedIds,
    toggleFavorite,
    isToggling: isFavoriteToggling,
    canFavorite,
  } = useEntityFavorites('template');
  const { byId, queryKey } = useTemplateEngagement(ids);

  const likesCount = useCallback(
    (id: string, fallback = 0) => byId.get(id)?.likes_count ?? fallback,
    [byId]
  );

  const cardProps = useCallback(
    (id: string): InteractionProps => ({
      liked: likedIds.has(id),
      ...(canLike && { onToggleLike: () => toggleLike(id) }),
      likeToggling: isLikeToggling(id),
      favorited: favoritedIds.has(id),
      ...(canFavorite && { onToggleFavorite: () => toggleFavorite(id) }),
      favoriteToggling: isFavoriteToggling(id),
      ...(canLike && {
        footer: (
          <TemplateReactions
            templateId={id}
            reactions={byId.get(id)?.reactions ?? []}
            queryKey={queryKey}
          />
        ),
      }),
    }),
    [
      likedIds,
      canLike,
      toggleLike,
      isLikeToggling,
      favoritedIds,
      canFavorite,
      toggleFavorite,
      isFavoriteToggling,
      byId,
      queryKey,
    ]
  );

  return { cardProps, likesCount, favoritedIds };
}
