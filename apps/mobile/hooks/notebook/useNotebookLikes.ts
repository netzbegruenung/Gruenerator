import { getContractsClient } from '@gruenerator/shared/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { type PublicNotebook } from './usePublicNotebookCollections';

const LIKED_KEY = ['notebook', 'liked-ids'] as const;
const PUBLIC_KEY = ['notebook', 'public-collections'] as const;

/**
 * Like/unlike for public notebooks via the contracted endpoints. The heart flips
 * optimistically (toggling the liked-ids set and adjusting the cached `likes_count`
 * ±1); on success the authoritative count from the server replaces the estimate.
 */
export function useNotebookLikes(enabled: boolean) {
  const qc = useQueryClient();

  const likedQuery = useQuery({
    queryKey: LIKED_KEY,
    enabled,
    retry: false,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Set<string>> => {
      const result = await getContractsClient().notebookCollections.listMyLikedCollections();
      if (result.status !== 200) throw new Error('Likes konnten nicht geladen werden.');
      return new Set(result.body.liked_ids);
    },
  });

  const likedIds = likedQuery.data ?? new Set<string>();

  const bumpCount = (id: string, delta: number) => {
    qc.setQueryData<PublicNotebook[]>(PUBLIC_KEY, (prev) =>
      prev?.map((n) =>
        n.id === id ? { ...n, likes_count: Math.max(0, (n.likes_count ?? 0) + delta) } : n
      )
    );
  };

  const setCount = (id: string, count: number) => {
    qc.setQueryData<PublicNotebook[]>(PUBLIC_KEY, (prev) =>
      prev?.map((n) => (n.id === id ? { ...n, likes_count: count } : n))
    );
  };

  const mutation = useMutation({
    mutationFn: async ({ id, like }: { id: string; like: boolean }) => {
      const client = getContractsClient().notebookCollections;
      const result = like
        ? await client.likeCollection({ params: { id } })
        : await client.unlikeCollection({ params: { id } });
      if (result.status !== 200) throw new Error('Aktion fehlgeschlagen.');
      return { id, count: result.body.count };
    },
    onMutate: async ({ id, like }) => {
      await qc.cancelQueries({ queryKey: LIKED_KEY });
      const prevLiked = qc.getQueryData<Set<string>>(LIKED_KEY);
      const next = new Set(prevLiked ?? []);
      if (like) next.add(id);
      else next.delete(id);
      qc.setQueryData(LIKED_KEY, next);
      bumpCount(id, like ? 1 : -1);
      return { prevLiked };
    },
    onError: (_err, { id, like }, ctx) => {
      if (ctx?.prevLiked) qc.setQueryData(LIKED_KEY, ctx.prevLiked);
      bumpCount(id, like ? -1 : 1);
    },
    onSuccess: ({ id, count }) => {
      setCount(id, count);
    },
  });

  return {
    isLiked: (id: string) => likedIds.has(id),
    toggleLike: (id: string) => mutation.mutate({ id, like: !likedIds.has(id) }),
  };
}
