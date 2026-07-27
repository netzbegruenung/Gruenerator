/**
 * Websites connected to the account.
 *
 * Shared by the settings tab and the notebook WordPress source: the notebook
 * only stores a `websiteId`, so both need the same catalogue to resolve a name
 * and URL from it.
 */
import { type UserWebsite } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

const QUERY_KEY = ['user-websites'] as const;

/** Shared by the hook and the tab's preload, so both hit the same cache entry. */
export const userWebsitesQuery = {
  queryKey: QUERY_KEY,
  queryFn: async (): Promise<UserWebsite[]> => {
    const result = await getContractsClient().userWebsites.listWebsites();
    if (result.status !== 200) throw new Error('Websites konnten nicht geladen werden.');
    return result.body.websites;
  },
  staleTime: 5 * 60 * 1000,
};

export function useUserWebsites() {
  return useQuery(userWebsitesQuery);
}

export function useAddUserWebsite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (siteUrl: string): Promise<UserWebsite> => {
      const result = await getContractsClient().userWebsites.addWebsite({
        body: { site_url: siteUrl },
      });
      if (result.status === 200) return result.body.website;
      const body = result.body as { error?: string } | undefined;
      throw new Error(body?.error || 'Website konnte nicht verbunden werden.');
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export function useRefreshUserWebsite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (websiteId: string): Promise<UserWebsite> => {
      const result = await getContractsClient().userWebsites.refreshWebsite({
        params: { id: websiteId },
        body: {},
      });
      if (result.status === 200) return result.body.website;
      const body = result.body as { error?: string } | undefined;
      throw new Error(body?.error || 'Website konnte nicht aktualisiert werden.');
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export function useDeleteUserWebsite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (websiteId: string): Promise<void> => {
      const result = await getContractsClient().userWebsites.deleteWebsite({
        params: { id: websiteId },
      });
      if (result.status !== 200) throw new Error('Website konnte nicht entfernt werden.');
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
