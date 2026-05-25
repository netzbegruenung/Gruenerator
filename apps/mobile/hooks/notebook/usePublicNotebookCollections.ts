import { getContractsClient } from '@gruenerator/shared/api';
import { useQuery } from '@tanstack/react-query';

/**
 * Public "Von der Basis" notebooks. Reuses the contracted `listPublicCollections`
 * endpoint web uses — the backend already locale-filters (de-DE/de-AT) and enriches
 * each row with `creator_name` + `likes_count`, so mobile adds no backend.
 *
 * The element type is derived straight off the contracts-client return type (no
 * hand-written interface, no zod import) per the project's type-derivation rule.
 */
type ListPublicResult = Awaited<
  ReturnType<ReturnType<typeof getContractsClient>['notebookCollections']['listPublicCollections']>
>;
export type PublicNotebook = Extract<
  ListPublicResult,
  { status: 200 }
>['body']['collections'][number];

export function usePublicNotebookCollections(enabled: boolean) {
  const query = useQuery({
    queryKey: ['notebook', 'public-collections'],
    enabled,
    retry: false,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<PublicNotebook[]> => {
      const result = await getContractsClient().notebookCollections.listPublicCollections();
      if (result.status !== 200) {
        throw new Error('Öffentliche Notebooks konnten nicht geladen werden.');
      }
      return result.body.collections;
    },
  });

  return {
    publicNotebooks: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error?.message ?? null,
  };
}
