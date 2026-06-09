import { getContractsClient } from '@gruenerator/shared/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';

import { useAuthStore } from '../../../stores/authStore';

import type { GalleryTemplate } from '@gruenerator/contracts';

export type EntityFavoriteType = 'template';

interface FavoritesData {
  favorite_ids: string[];
  templates: GalleryTemplate[];
}

export const templateFavoritesQueryKey = ['templateFavorites'] as const;

async function fetchFavorites(entityType: EntityFavoriteType): Promise<FavoritesData> {
  if (entityType !== 'template') return { favorite_ids: [], templates: [] };
  const client = getContractsClient();
  const result = await client.templateInteractions.listMyFavoriteTemplates();
  if (result.status !== 200) throw new Error('Konnte Favoriten nicht laden');
  return { favorite_ids: result.body.favorite_ids, templates: result.body.templates };
}

async function callFavorite(entityId: string): Promise<void> {
  const client = getContractsClient();
  const result = await client.templateInteractions.favoriteTemplate({ params: { id: entityId } });
  if (result.status !== 200) throw new Error('Favorit speichern fehlgeschlagen');
}

async function callUnfavorite(entityId: string): Promise<void> {
  const client = getContractsClient();
  const result = await client.templateInteractions.unfavoriteTemplate({ params: { id: entityId } });
  if (result.status !== 200) throw new Error('Favorit entfernen fehlgeschlagen');
}

export interface UseEntityFavoritesResult {
  favoritedIds: Set<string>;
  favoriteTemplates: GalleryTemplate[];
  isLoaded: boolean;
  toggleFavorite: (entityId: string) => void;
  isToggling: (entityId: string) => boolean;
  canFavorite: boolean;
}

/**
 * DB-backed favorites toggle, mirroring useEntityLikes. The single
 * ['templateFavorites'] query returns both the favorited ids (driving star
 * state everywhere) and the full favorited template objects (consumed by the
 * "Meine Vorlagen" Favoriten section).
 */
export function useEntityFavorites(entityType: EntityFavoriteType): UseEntityFavoritesResult {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const qc = useQueryClient();
  const [pending, setPending] = useState<Set<string>>(() => new Set());

  const query = useQuery({
    queryKey: templateFavoritesQueryKey,
    queryFn: () => fetchFavorites(entityType),
    enabled: isAuthenticated,
    retry: 1,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const favoritedIds = useMemo(
    () => new Set(query.data?.favorite_ids ?? []),
    [query.data?.favorite_ids]
  );

  const mutation = useMutation({
    mutationFn: async (entityId: string) => {
      const isCurrentlyFavorited = favoritedIds.has(entityId);
      return isCurrentlyFavorited ? callUnfavorite(entityId) : callFavorite(entityId);
    },
    onMutate: async (entityId) => {
      setPending((prev) => new Set(prev).add(entityId));
      const previous = query.data;
      const isCurrentlyFavorited = favoritedIds.has(entityId);

      qc.setQueryData<FavoritesData | undefined>(templateFavoritesQueryKey, (prev) => {
        if (!prev) return prev;
        if (isCurrentlyFavorited) {
          return {
            favorite_ids: prev.favorite_ids.filter((id) => id !== entityId),
            templates: prev.templates.filter((t) => String(t.id) !== entityId),
          };
        }
        return { ...prev, favorite_ids: [...prev.favorite_ids, entityId] };
      });

      return { previous };
    },
    onError: (_err, _entityId, context) => {
      if (context?.previous) {
        qc.setQueryData(templateFavoritesQueryKey, context.previous);
      }
    },
    onSettled: (_data, _err, entityId) => {
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(entityId);
        return next;
      });
      // Refetch so a freshly-added favorite gets its full template object.
      void qc.invalidateQueries({ queryKey: templateFavoritesQueryKey });
    },
  });

  const toggleFavorite = useCallback(
    (entityId: string) => {
      if (!isAuthenticated) return;
      mutation.mutate(entityId);
    },
    [isAuthenticated, mutation]
  );

  const isToggling = useCallback((entityId: string) => pending.has(entityId), [pending]);

  return {
    favoritedIds,
    favoriteTemplates: query.data?.templates ?? [],
    isLoaded: query.isSuccess || !isAuthenticated,
    toggleFavorite,
    isToggling,
    canFavorite: isAuthenticated,
  };
}
