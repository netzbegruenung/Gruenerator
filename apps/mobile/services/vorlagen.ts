import { apiRequest } from '@gruenerator/shared/api';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://gruenerator.eu/api';

export interface TemplateImage {
  url: string;
  display_order: number;
}

export interface Template {
  id: string;
  title: string;
  description?: string;
  template_type?: string;
  thumbnail_url?: string | null;
  canvaUrl?: string;
  external_url?: string;
  tags?: string[];
  images?: TemplateImage[];
  metadata?: {
    author_name?: string;
    contact_email?: string;
  };
}

export interface TemplateCategory {
  id: string;
  label: string;
}

const getPublicImageUrl = (relativePath: string | undefined): string | null => {
  if (!relativePath) return null;
  return relativePath.startsWith('http')
    ? relativePath
    : `${API_BASE_URL}/api/templates/images/${relativePath}`;
};

export async function fetchVorlagen(params?: { templateType?: string }): Promise<Template[]> {
  try {
    const queryParams = params?.templateType ? `?templateType=${params.templateType}` : '';
    const response = await apiRequest<{ vorlagen: unknown[] }>(
      'get',
      `/auth/vorlagen${queryParams}`
    );
    const vorlagen = response?.vorlagen || [];

    return vorlagen.map((template: unknown) => {
      const t = template as Record<string, unknown>;

      const rawImages = (t.canva_template_images || t.images || []) as Array<{
        url: string;
        display_order: number;
      }>;
      const images = rawImages
        .sort((a, b) => a.display_order - b.display_order)
        .map((img) => ({
          ...img,
          url: getPublicImageUrl(img.url) || '',
        }))
        .filter((img) => img.url !== '');

      const rawTags = (t.template_to_tags || t.tags || []) as Array<{
        template_tags?: { name: string };
        name?: string;
      }>;
      const tags = rawTags
        .filter((jtt) => jtt.template_tags || jtt.name)
        .map((jtt) => jtt.template_tags?.name || jtt.name || '');

      return {
        id: t.id as string,
        title: t.title as string,
        description: t.description as string | undefined,
        template_type: t.template_type as string | undefined,
        thumbnail_url: images[0]?.url || null,
        canvaUrl: (t.canvaurl || t.canva_url) as string | undefined,
        external_url: (t.external_url || t.canvaurl || t.canva_url) as string | undefined,
        tags,
        images,
        metadata: t.metadata as Template['metadata'],
      };
    });
  } catch (error) {
    console.error('[Vorlagen] Failed to fetch templates:', error);
    return [];
  }
}

export async function fetchVorlagenCategories(): Promise<TemplateCategory[]> {
  try {
    const response = await apiRequest<{ success: boolean; categories: TemplateCategory[] }>(
      'get',
      '/auth/vorlagen-categories'
    );
    return response?.categories || [];
  } catch (error) {
    console.error('[Vorlagen] Failed to fetch categories:', error);
    return [];
  }
}

export interface TemplateLike {
  template_id: string;
  template_type: string;
  created_at: string;
}

export async function fetchTemplateLikes(): Promise<string[]> {
  try {
    const response = await apiRequest<{ success: boolean; likes: TemplateLike[] }>(
      'get',
      '/auth/vorlagen/likes'
    );
    return (response?.likes || []).map((like) => like.template_id);
  } catch (error) {
    console.error('[Vorlagen] Failed to fetch likes:', error);
    return [];
  }
}

export async function likeTemplate(
  templateId: string,
  templateType: string = 'system'
): Promise<boolean> {
  try {
    await apiRequest('post', `/auth/vorlagen/${templateId}/like`, { templateType });
    return true;
  } catch (error) {
    console.error('[Vorlagen] Failed to like template:', error);
    return false;
  }
}

export async function unlikeTemplate(templateId: string): Promise<boolean> {
  try {
    await apiRequest('delete', `/auth/vorlagen/${templateId}/like`);
    return true;
  } catch (error) {
    console.error('[Vorlagen] Failed to unlike template:', error);
    return false;
  }
}
