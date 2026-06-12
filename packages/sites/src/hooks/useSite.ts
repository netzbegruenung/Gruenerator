import {
  richTextDocFromPlainText,
  type CreateSiteBody,
  type RichTextDoc,
  type Site,
  type UpdateSiteBody,
} from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import apiClient from '../lib/apiClient';
import { SitesApiError } from '../utils/errorHandler';

export type SiteData = Site;

export interface AiGeneratedContent {
  hero: { heading: string; text: string };
  about: { title: string; content: string };
  hero_image: { title: string; subtitle: string; imageUrl?: string };
  themes: Array<{ title: string; content: string; imageUrl?: string }>;
  actions: Array<{ text: string; link: string; imageUrl?: string }>;
  contact: { title: string; email: string; backgroundImageUrl?: string };
}

export interface GeneratedSiteData {
  site_title: string;
  tagline: string;
  contact_email: string;
  sections: {
    about: { title: string; content: RichTextDoc };
    heroImage: { imageUrl: string; title: string; subtitle: string };
    themes: Array<{ imageUrl: string; title: string; content: RichTextDoc }>;
    actions: Array<{ imageUrl: string; text: string; link: string }>;
    contact: { title: string; backgroundImageUrl: string };
  };
}

function transformAiResponse(ai: AiGeneratedContent): GeneratedSiteData {
  return {
    site_title: ai.hero.heading,
    tagline: ai.hero.text,
    contact_email: ai.contact.email,
    sections: {
      about: {
        title: ai.about.title || 'Wer ich bin',
        content: richTextDocFromPlainText(ai.about.content),
      },
      heroImage: {
        imageUrl: ai.hero_image.imageUrl || '',
        title: ai.hero_image.title,
        subtitle: ai.hero_image.subtitle,
      },
      themes: ai.themes.map((t) => ({
        imageUrl: t.imageUrl || '',
        title: t.title,
        content: richTextDocFromPlainText(t.content),
      })),
      actions: ai.actions.map((a) => ({ imageUrl: a.imageUrl || '', text: a.text, link: a.link })),
      contact: { title: ai.contact.title, backgroundImageUrl: ai.contact.backgroundImageUrl || '' },
    },
  };
}

function toApiError(res: { status: number; body: unknown }): SitesApiError {
  const message =
    (res.body as { error?: string } | null | undefined)?.error ?? `HTTP ${res.status}`;
  return new SitesApiError(res.status, message);
}

export function useSite() {
  const queryClient = useQueryClient();

  const {
    data: site,
    isLoading,
    error,
    refetch,
  } = useQuery<Site | null>({
    queryKey: ['my-site'],
    queryFn: async () => {
      const res = await getContractsClient().sites.getMySite();
      if (res.status !== 200) throw toApiError(res);
      return res.body.site;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: CreateSiteBody) => {
      const res = await getContractsClient().sites.createSite({ body: data });
      if (res.status !== 200) throw toApiError(res);
      return res.body.site;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['my-site'] });
    },
  });

  const updateMutation = useMutation({
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
    mutationFn: async ({ id, publish }: { id: string; publish: boolean }) => {
      const res = await getContractsClient().sites.publishSite({
        params: { id },
        body: { publish },
      });
      if (res.status !== 200) throw toApiError(res);
      return res.body.site;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['my-site'] });
    },
  });

  const generateMutation = useMutation({
    mutationFn: async (data: {
      description: string;
      email?: string;
    }): Promise<{ transformed: GeneratedSiteData; raw: AiGeneratedContent }> => {
      const response = await apiClient.post<{ json: AiGeneratedContent }>('/claude_website', data);
      const raw: AiGeneratedContent = response.data.json;
      return { transformed: transformAiResponse(raw), raw };
    },
  });

  const flyerMutation = useMutation({
    mutationFn: async (data: {
      file: File;
      email?: string;
    }): Promise<{ transformed: GeneratedSiteData; raw: AiGeneratedContent }> => {
      const formData = new FormData();
      formData.append('flyer', data.file);
      if (data.email) formData.append('email', data.email);

      const response = await apiClient.post<{ json: AiGeneratedContent }>(
        '/sites/generate-from-flyer',
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 120000,
        }
      );
      const raw: AiGeneratedContent = response.data.json;
      return { transformed: transformAiResponse(raw), raw };
    },
  });

  return {
    site,
    isLoading,
    error,
    refetch,
    createSite: createMutation.mutateAsync,
    updateSite: updateMutation.mutateAsync,
    togglePublish: publishMutation.mutateAsync,
    generateSite: generateMutation.mutateAsync,
    generateFromFlyer: flyerMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isPublishing: publishMutation.isPending,
    isGenerating: generateMutation.isPending,
    isGeneratingFromFlyer: flyerMutation.isPending,
  };
}
