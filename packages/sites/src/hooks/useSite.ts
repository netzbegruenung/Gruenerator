import { removeDocCache } from '@gruenerator/collab';
import {
  type CreateSiteBody,
  type Site,
  type SitePublishIssue,
  type UpdateSiteBody,
  type WebsiteContent,
} from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

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

export function useSite() {
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery<{
    site: Site | null;
    public_origin: string | null;
  }>({
    queryKey: ['my-site'],
    queryFn: async () => {
      const res = await getContractsClient().sites.getMySite();
      if (res.status !== 200) throw toApiError(res);
      return { site: res.body.site, public_origin: res.body.public_origin };
    },
  });
  const site = data ? data.site : undefined;
  const publicOrigin = data ? data.public_origin : null;
  const prepareDraft = usePrepareSiteDraft();

  const createMutation = useMutation({
    // Callers surface errors themselves; the app-wide mutation toast would show a second one.
    meta: { silent: true },
    mutationFn: async (data: CreateSiteBody) => {
      const res = await getContractsClient().sites.createSite({ body: data });
      if (res.status !== 200) throw toApiError(res);
      return res.body.site;
    },
    // Awaited so `isCreating` holds until the new site is loaded and EditPage opens the editor.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my-site'] }),
  });

  const updateMutation = useMutation({
    // Callers surface errors themselves; the app-wide mutation toast would show a second one.
    meta: { silent: true },
    mutationFn: async ({ id, data }: { id: string; data: UpdateSiteBody }) => {
      const res = await getContractsClient().sites.updateSite({ params: { id }, body: data });
      if (res.status !== 200) throw toApiError(res);
      return res.body.site;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['my-site'] });
    },
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
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['my-site'] });
    },
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
      void queryClient.invalidateQueries({ queryKey: ['my-site'] });
    },
  });

  return {
    site,
    publicOrigin,
    prepareDraft,
    isLoading,
    error,
    refetch,
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
