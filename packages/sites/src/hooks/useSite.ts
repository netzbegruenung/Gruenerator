import { removeDocCache } from '@gruenerator/collab';
import {
  SITES_PER_ACCOUNT_MAX,
  type CreateSiteBody,
  type SiteRole,
  type Site,
  type SitePublishIssue,
  type UpdateSiteBody,
  type WebsiteContent,
} from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createContext, createElement, useContext, type ReactNode } from 'react';

import { type GeneratedSiteData } from '../generation/transform';
import { SitesApiError } from '../utils/errorHandler';

export type { GeneratedSiteData };

export type SiteData = Site;

/**
 * Die vom Server erzeugten Landing-Page-Inhalte. Abgeleitet aus dem
 * Zod-Schema in @gruenerator/contracts, nicht mehr hier nachgebaut — die
 * frühere Handkopie war eine zweite Wahrheit über dieselbe Antwort.
 */
export type AiGeneratedContent = WebsiteContent;

function toApiError(res: { status: number; body: unknown }): SitesApiError {
  const message =
    (res.body as { error?: string } | null | undefined)?.error ?? `HTTP ${res.status}`;
  return new SitesApiError(res.status, message);
}

export class SitePublishError extends SitesApiError {
  readonly issues: SitePublishIssue[];

  constructor(message: string, issues: SitePublishIssue[]) {
    super(422, message);
    this.name = 'SitePublishError';
    this.issues = issues;
  }
}

export function usePrepareSiteDraft() {
  const mutation = useMutation({
    mutationFn: async (siteId: string) => {
      const res = await getContractsClient().sites.prepareSiteDraft({
        params: { id: siteId },
        body: {},
      });
      if (res.status !== 200) throw toApiError(res);
      return res.body.seeded;
    },
  });
  return mutation.mutateAsync;
}

/** Every Sites query lives under this prefix; mutations invalidate it as a whole. */
export const SITES_QUERY_KEY = ['sites'] as const;
const SITE_LIST_KEY = ['sites', 'list'] as const;
export const siteHandleKey = (handle: string) => ['sites', 'handle', handle] as const;

export type SiteByHandleData = {
  site: Site;
  role: SiteRole;
  group: { id: string; name: string } | null;
  public_origin: string | null;
};

/** The account's sites for the overview, most recently edited first. */
export function useSiteList() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: SITE_LIST_KEY,
    queryFn: async () => {
      const res = await getContractsClient().sites.listSites();
      if (res.status !== 200) throw toApiError(res);
      return res.body;
    },
  });
  return {
    sites: data ? data.sites : null,
    publicOrigin: data ? data.public_origin : null,
    limit: data ? data.limit : SITES_PER_ACCOUNT_MAX,
    isLoading,
    error,
    refetch,
  };
}

/** One own site by address (or id); `site` is null when there is none under that name. */
export function useSiteByHandle(handle: string) {
  const { data, isLoading, error, refetch } = useQuery<SiteByHandleData | null>({
    queryKey: siteHandleKey(handle),
    queryFn: async () => {
      const res = await getContractsClient().sites.getSiteByHandle({ params: { handle } });
      if (res.status === 404) return null;
      if (res.status !== 200) throw toApiError(res);
      return res.body;
    },
  });
  return {
    site: data === undefined ? undefined : (data?.site ?? null),
    role: data ? data.role : null,
    group: data ? data.group : null,
    publicOrigin: data ? data.public_origin : null,
    isLoading,
    error,
    refetch,
  };
}

const CurrentSiteContext = createContext<SiteByHandleData | null>(null);

/** The site the editor has open; `useSite()` below reads it. */
export function CurrentSiteProvider({
  value,
  children,
}: {
  value: SiteByHandleData;
  children: ReactNode;
}) {
  return createElement(CurrentSiteContext.Provider, { value }, children);
}

function useSiteMutations() {
  const queryClient = useQueryClient();

  /** Write a returned site into every open by-handle entry for it, and under its address. */
  const storeSite = (site: Site) => {
    queryClient.setQueriesData<SiteByHandleData | null>({ queryKey: ['sites', 'handle'] }, (old) =>
      old && old.site.id === site.id ? { ...old, site } : old
    );
    const underHandle = queryClient.getQueryData<SiteByHandleData | null>(
      siteHandleKey(site.subdomain)
    );
    if (!underHandle) {
      const origin = queryClient.getQueryData<{ public_origin: string | null }>(SITE_LIST_KEY);
      // A moved address keeps the caller's role; only a fresh create has none yet (the creator is admin).
      const known = queryClient
        .getQueriesData<SiteByHandleData | null>({ queryKey: ['sites', 'handle'] })
        .find(([, entry]) => entry?.site.id === site.id)?.[1];
      queryClient.setQueryData<SiteByHandleData>(siteHandleKey(site.subdomain), {
        site,
        role: known?.role ?? 'admin',
        group: known?.group ?? null,
        public_origin: origin?.public_origin ?? null,
      });
    }
    void queryClient.invalidateQueries({ queryKey: SITE_LIST_KEY });
  };

  const createMutation = useMutation({
    // Callers surface errors themselves; the app-wide mutation toast would show a second one.
    meta: { silent: true },
    mutationFn: async (data: CreateSiteBody) => {
      const res = await getContractsClient().sites.createSite({ body: data });
      if (res.status !== 200) throw toApiError(res);
      return res.body.site;
    },
    onSuccess: storeSite,
  });

  const updateMutation = useMutation({
    // Callers surface errors themselves; the app-wide mutation toast would show a second one.
    meta: { silent: true },
    mutationFn: async ({ id, data }: { id: string; data: UpdateSiteBody }) => {
      const res = await getContractsClient().sites.updateSite({ params: { id }, body: data });
      if (res.status !== 200) throw toApiError(res);
      return res.body.site;
    },
    onSuccess: storeSite,
  });

  const publishMutation = useMutation({
    // Callers surface errors themselves; the app-wide mutation toast would show a second one.
    meta: { silent: true },
    mutationFn: async ({ id, publish }: { id: string; publish: boolean }) => {
      const res = await getContractsClient().sites.publishSite({
        params: { id },
        body: { publish },
      });
      if (res.status === 422) throw new SitePublishError(res.body.error, res.body.issues);
      if (res.status !== 200) throw toApiError(res);
      return res.body.site;
    },
    onSuccess: storeSite,
  });

  const deleteMutation = useMutation({
    // Callers surface errors themselves; the app-wide mutation toast would show a second one.
    meta: { silent: true },
    mutationFn: async (id: string) => {
      const res = await getContractsClient().sites.deleteSite({ params: { id }, body: {} });
      if (res.status !== 200) throw toApiError(res);
      removeDocCache(`site-${id}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SITES_QUERY_KEY });
    },
  });

  return {
    createSite: createMutation.mutateAsync,
    updateSite: updateMutation.mutateAsync,
    togglePublish: publishMutation.mutateAsync,
    deleteSite: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isPublishing: publishMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

/** Creating a site, outside the editor (no current site yet). */
export function useCreateSite() {
  const { createSite, isCreating } = useSiteMutations();
  const { publicOrigin } = useSiteList();
  return { createSite, isCreating, publicOrigin };
}

/** The open site plus its mutations; only inside `<CurrentSiteProvider>`. */
export function useSite() {
  const current = useContext(CurrentSiteContext);
  if (!current) throw new Error('useSite must be used inside <CurrentSiteProvider>');
  return {
    site: current.site,
    role: current.role,
    publicOrigin: current.public_origin,
    ...useSiteMutations(),
  };
}
