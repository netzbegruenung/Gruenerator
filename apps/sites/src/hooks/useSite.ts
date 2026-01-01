import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../lib/apiClient';

interface AiGeneratedContent {
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
  bio: string;
  contact_email: string;
  sections: {
    heroImage: { imageUrl: string; title: string; subtitle: string };
    themes: Array<{ imageUrl: string; title: string; content: string }>;
    actions: Array<{ imageUrl: string; text: string; link: string }>;
    contact: { title: string; backgroundImageUrl: string };
  };
}

function transformAiResponse(ai: AiGeneratedContent): GeneratedSiteData {
  return {
    site_title: ai.hero.heading,
    tagline: ai.hero.text,
    bio: ai.about.content,
    contact_email: ai.contact.email,
    sections: {
      heroImage: { imageUrl: ai.hero_image.imageUrl || '', title: ai.hero_image.title, subtitle: ai.hero_image.subtitle },
      themes: ai.themes.map(t => ({ imageUrl: t.imageUrl || '', title: t.title, content: t.content })),
      actions: ai.actions.map(a => ({ imageUrl: a.imageUrl || '', text: a.text, link: a.link })),
      contact: { title: ai.contact.title, backgroundImageUrl: ai.contact.backgroundImageUrl || '' },
    },
  };
}

interface SiteData {
  id: string;
  user_id: string;
  subdomain: string;
  site_title: string;
  tagline?: string;
  bio?: string;
  contact_email?: string;
  social_links?: Record<string, string>;
  profile_image?: string;
  background_image?: string;
  sections?: {
    themes?: Array<{ imageUrl: string; title: string; content: string }>;
    actions?: Array<{ imageUrl: string; text: string; link: string }>;
    heroImage?: { imageUrl: string; title: string; subtitle: string };
    contact?: { title: string; backgroundImageUrl: string };
  };
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export function useSite() {
  const queryClient = useQueryClient();

  const { data: site, isLoading, error, refetch } = useQuery<SiteData | null>({
    queryKey: ['my-site'],
    queryFn: async () => {
      try {
        const response = await apiClient.get('/sites/my-site');
        return response.data.site;
      } catch (err: unknown) {
        if (err && typeof err === 'object' && 'response' in err) {
          const axiosError = err as { response?: { status: number } };
          if (axiosError.response?.status === 404) {
            return null;
          }
        }
        throw err;
      }
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: Partial<SiteData>) => {
      const response = await apiClient.post('/sites/create', data);
      return response.data.site;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-site'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<SiteData> }) => {
      const response = await apiClient.put(`/sites/${id}`, data);
      return response.data.site;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-site'] });
    },
  });

  const publishMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiClient.post(`/sites/${id}/publish`, { publish: true });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-site'] });
    },
  });

  const generateMutation = useMutation({
    mutationFn: async (data: { description: string; email?: string }): Promise<GeneratedSiteData> => {
      const response = await apiClient.post('/claude_website', data);
      return transformAiResponse(response.data.json);
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
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isPublishing: publishMutation.isPending,
    isGenerating: generateMutation.isPending,
  };
}
