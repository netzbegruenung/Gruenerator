import { useQuery } from '@tanstack/react-query';

import apiClient from '../../../components/utils/apiClient';

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
      const response = await apiClient.get(`/docs?limit=${limit}`);
      const docs = (response.data as RecentDoc[]).filter(
        (d) => d.document_subtype !== 'boards'
      );
      return docs;
    },
    staleTime: 30_000,
    enabled,
  });

  return {
    docs: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}

export default useRecentDocs;
