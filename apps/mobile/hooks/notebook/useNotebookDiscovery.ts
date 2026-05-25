import { getContractsClient } from '@gruenerator/shared/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export interface PublicCollection {
  id: string;
  name: string;
  description: string | null;
  likes_count: number;
  creator_name: string | null;
  audience: 'de-DE' | 'de-AT' | null;
}

/**
 * "Von der Basis" discovery: the publicly published notebook collections plus the
 * authenticated user's liked-ids, with like/unlike mutations. Mirrors web's
 * VonDerBasisSection + usePublicNotebookCollections. The backend already applies the
 * locale audience filter to the public listing; we additionally drop notebooks whose
 * explicit audience differs from the viewer's locale as a belt-and-suspenders guard.
 */
export function useNotebookDiscovery(locale: 'de-DE' | 'de-AT') {
  const client = getContractsClient().notebookCollections;
  const qc = useQueryClient();
  const likesKey = ['notebook', 'liked-ids'];

  const publicCollections = useQuery({
    queryKey: ['notebook', 'public-collections'],
    staleTime: 60_000,
    queryFn: async (): Promise<PublicCollection[]> => {
      const res = await client.listPublicCollections({});
      if (res.status !== 200) return [];
      return res.body.collections
        .map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description ?? null,
          likes_count: c.likes_count ?? 0,
          creator_name: c.creator_name ?? null,
          audience: c.audience ?? null,
        }))
        .filter((c) => !c.audience || c.audience === locale);
    },
  });

  const likedIds = useQuery({
    queryKey: likesKey,
    staleTime: 60_000,
    queryFn: async (): Promise<string[]> => {
      const res = await client.listMyLikedCollections({});
      return res.status === 200 ? res.body.liked_ids : [];
    },
  });

  const like = useMutation({
    mutationFn: async (id: string) => {
      const res = await client.likeCollection({ params: { id } });
      if (res.status !== 200) throw new Error('Like fehlgeschlagen');
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: likesKey }),
  });

  const unlike = useMutation({
    mutationFn: async (id: string) => {
      const res = await client.unlikeCollection({ params: { id } });
      if (res.status !== 200) throw new Error('Like konnte nicht entfernt werden');
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: likesKey }),
  });

  const likedSet = new Set(likedIds.data ?? []);
  const toggleLike = (id: string) => (likedSet.has(id) ? unlike.mutate(id) : like.mutate(id));

  return {
    collections: publicCollections.data ?? [],
    isLoading: publicCollections.isLoading,
    likedIds: likedSet,
    toggleLike,
  };
}
