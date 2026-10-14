import { useCallback } from 'react';

import { type VorlagenCardProps } from '../../../components/common/Gallery/VorlagenCard';
import { useEntityFavorites } from '../../favorites/hooks/useEntityFavorites';
import { useEntityLikes } from '../../likes/hooks/useEntityLikes';

import { useTemplateEngagement } from './useTemplateEngagement';

type InteractionProps = Pick<
  VorlagenCardProps,
  'liked' | 'onToggleLike' | 'likeToggling' | 'favorited' | 'onToggleFavorite' | 'favoriteToggling'
>;

/**
 * Like and Merken for a set of Vorlagen cards — the same for
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
  const { byId } = useTemplateEngagement(ids);

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
    ]
  );

  return { cardProps, likesCount, favoritedIds };
}
