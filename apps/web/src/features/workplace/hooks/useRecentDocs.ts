import { getContractsClient } from '@gruenerator/shared/api';
import { useQuery } from '@tanstack/react-query';

export interface RecentDoc {
  id: string;
  title: string;
  updated_at: string;
  creator_name?: string;
  document_subtype?: string;
  access_type?: 'owner' | 'direct' | 'group' | 'public';
}

function useRecentDocs(limit = 5, enabled = true) {
  const query = useQuery<RecentDoc[]>({
    queryKey: ['workplace-recent-docs', limit],
    queryFn: async () => {
      const res = await getContractsClient().docs.listDocuments({
        query: { limit: String(limit) },
      });
      if (res.status !== 200) throw new Error('Failed to load recent documents');
      return res.body as RecentDoc[];
    },
    staleTime: 5 * 60 * 1000,
    enabled,
  });

  return {
    docs: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}

export default useRecentDocs;
