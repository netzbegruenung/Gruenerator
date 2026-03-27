import { useQuery } from '@tanstack/react-query';

import apiClient from '../../../components/utils/apiClient';

export interface FeaturedVorlage {
  id: string;
  title: string;
  description: string;
  template_type: string;
  thumbnail_url: string | null;
  external_url: string | null;
  tags: string[];
}

export function useFeaturedVorlagen(limit = 5) {
  return useQuery<FeaturedVorlage[]>({
    queryKey: ['featured-vorlagen', limit],
    queryFn: async () => {
      const res = await apiClient.get('/auth/vorlagen');
      const vorlagen = (res.data as { vorlagen: FeaturedVorlage[] }).vorlagen || [];
      return vorlagen.slice(0, limit);
    },
    staleTime: 60_000,
  });
}
