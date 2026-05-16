import { getContractsClient } from '@gruenerator/shared/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';

import { useAuthStore } from '../../../stores/authStore';

import type { NotebookCollection } from '../../../types/notebook';

export type EntityLikeType = 'notebook' | 'template';

const likedIdsQueryKey = (entityType: EntityLikeType) => ['entityLikes', entityType] as const;

const PUBLIC_NOTEBOOKS_KEY = ['notebookCollections', 'public'] as const;

async function fetchLikedIds(entityType: EntityLikeType): Promise<string[]> {
  if (entityType !== 'notebook') {
    return [];
  }
  const client = getContractsClient();
  const result = await client.notebookCollections.listMyLikedCollections();
  if (result.status !== 200) {
    throw new Error('Konnte Likes nicht laden');
  }
  return result.body.liked_ids;
}

async function callLike(
  entityType: EntityLikeType,
  entityId: string
): Promise<{ liked: boolean; count: number }> {
  if (entityType !== 'notebook') {
    throw new Error(`Like backend for entityType '${entityType}' not wired yet`);
  }
  const client = getContractsClient();
  const result = await client.notebookCollections.likeCollection({ params: { id: entityId } });
  if (result.status !== 200) throw new Error('Like fehlgeschlagen');
  return { liked: true, count: result.body.count };
}

async function callUnlike(
  entityType: EntityLikeType,
  entityId: string
): Promise<{ liked: boolean; count: number }> {
  if (entityType !== 'notebook') {
    throw new Error(`Unlike backend for entityType '${entityType}' not wired yet`);
  }
  const client = getContractsClient();
  const result = await client.notebookCollections.unlikeCollection({ params: { id: entityId } });
  if (result.status !== 200) throw new Error('Unlike fehlgeschlagen');
  return { liked: false, count: result.body.count };
}

function patchPublicNotebooksCache(
  qc: ReturnType<typeof useQueryClient>,
  entityId: string,
  delta: number
) {
  qc.setQueryData<NotebookCollection[] | undefined>(PUBLIC_NOTEBOOKS_KEY, (prev) => {
    if (!prev) return prev;
    return prev.map((c) =>
      c.id === entityId ? { ...c, likes_count: Math.max(0, (c.likes_count ?? 0) + delta) } : c
    );
  });
}

export interface UseEntityLikesResult {
  likedIds: Set<string>;
  isLoaded: boolean;
  toggleLike: (entityId: string) => void;
  isToggling: (entityId: string) => boolean;
  canLike: boolean;
}

export function useEntityLikes(entityType: EntityLikeType): UseEntityLikesResult {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const qc = useQueryClient();
  const [pending, setPending] = useState<Set<string>>(() => new Set());

  const query = useQuery({
    queryKey: likedIdsQueryKey(entityType),
    queryFn: () => fetchLikedIds(entityType),
    enabled: isAuthenticated && entityType === 'notebook',
    retry: 1,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const likedIds = useMemo(() => new Set(query.data ?? []), [query.data]);

  const mutation = useMutation({
    mutationFn: async (entityId: string) => {
      const isCurrentlyLiked = likedIds.has(entityId);
      return isCurrentlyLiked ? callUnlike(entityType, entityId) : callLike(entityType, entityId);
    },
    onMutate: async (entityId) => {
      setPending((prev) => {
        const next = new Set(prev);
        next.add(entityId);
        return next;
      });
      const previousIds = query.data ?? [];
      const isCurrentlyLiked = likedIds.has(entityId);
      const nextIds = isCurrentlyLiked
        ? previousIds.filter((id) => id !== entityId)
        : [...previousIds, entityId];
      qc.setQueryData(likedIdsQueryKey(entityType), nextIds);

      if (entityType === 'notebook') {
        patchPublicNotebooksCache(qc, entityId, isCurrentlyLiked ? -1 : 1);
      }
      return { previousIds, wasLiked: isCurrentlyLiked };
    },
    onError: (_err, entityId, context) => {
      if (context) {
        qc.setQueryData(likedIdsQueryKey(entityType), context.previousIds);
        if (entityType === 'notebook') {
          patchPublicNotebooksCache(qc, entityId, context.wasLiked ? 1 : -1);
        }
      }
    },
    onSettled: (_data, _err, entityId) => {
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(entityId);
        return next;
      });
    },
  });

  const toggleLike = useCallback(
    (entityId: string) => {
      if (!isAuthenticated) return;
      mutation.mutate(entityId);
    },
    [isAuthenticated, mutation]
  );

  const isToggling = useCallback((entityId: string) => pending.has(entityId), [pending]);

  return {
    likedIds,
    isLoaded: query.isSuccess || !isAuthenticated,
    toggleLike,
    isToggling,
    canLike: isAuthenticated,
  };
}
