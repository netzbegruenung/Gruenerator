/**
 * Antragsgrün sites the Grünerator created for the account (settings →
 * Konnektoren). The list comes from our table; the admin status is a live
 * check against antragsgruen.de and loads separately so it never holds the
 * list back.
 */
import {
  type AntragsgruenSiteAccess,
  type AntragsgruenSiteListResponse,
} from '@gruenerator/contracts';
import { ApiError, getContractsClient } from '@gruenerator/shared/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

const QUERY_KEY = ['antragsgruen-sites'] as const;
const ACCESS_KEY = ['antragsgruen-sites', 'access'] as const;

export const antragsgruenSitesQuery = {
  queryKey: QUERY_KEY,
  queryFn: async (): Promise<AntragsgruenSiteListResponse> => {
    const result = await getContractsClient().antragsgruenSites.listSites();
    if (result.status !== 200)
      throw new ApiError(result.status, 'Antragsgrün-Seiten konnten nicht geladen werden.');
    return result.body;
  },
  staleTime: 5 * 60 * 1000,
};

export function useAntragsgruenSites() {
  return useQuery(antragsgruenSitesQuery);
}

export function useAntragsgruenSiteAccess(enabled: boolean) {
  return useQuery({
    queryKey: ACCESS_KEY,
    queryFn: async (): Promise<Record<string, AntragsgruenSiteAccess>> => {
      const result = await getContractsClient().antragsgruenSites.siteAccess();
      if (result.status !== 200)
        throw new ApiError(result.status, 'Status konnte nicht geprüft werden.');
      return result.body.access;
    },
    enabled,
    staleTime: 60 * 1000,
    // The section shows "nicht abrufbar" itself; antragsgruen.de being slow is not our bug.
    meta: { silent: true },
  });
}

export function useForgetAntragsgruenSite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const result = await getContractsClient().antragsgruenSites.forgetSite({ params: { id } });
      if (result.status !== 200)
        throw new ApiError(result.status, 'Seite konnte nicht entfernt werden.');
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
