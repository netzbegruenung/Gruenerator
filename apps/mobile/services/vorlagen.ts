import { apiRequest, getContractsClient } from '@gruenerator/shared/api';
import { resolveStoredImageUrl } from '@gruenerator/shared/media-library/shareUrl';

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

/**
 * Ein gespeichertes Vorlagenbild ist entweder ein absolutes gecrawltes
 * `og:image` oder die `/share/<token>`-Seiten-URL, die der Web-Dialog beim
 * Hochladen gesichert hat. Für die zweite Sorte muss die Vorschau-Variante her
 * — `API_BASE_URL` enthält das `/api`-Präfix bereits.
 */
const getPublicImageUrl = (storedUrl: string | undefined): string | null =>
  resolveStoredImageUrl(storedUrl, { baseUrl: API_BASE_URL, width: 400 });

export async function fetchVorlagen(params?: {
  templateType?: string;
  favorites?: boolean;
}): Promise<Template[]> {
  try {
    const query = new URLSearchParams();
    if (params?.templateType) query.set('templateType', params.templateType);
    if (params?.favorites) query.set('favorites', '1');
    const queryParams = query.size > 0 ? `?${query}` : '';
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
        thumbnail_url:
          getPublicImageUrl(t.thumbnail_url as string | undefined) || images[0]?.url || null,
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

/** Which Vorlagen the user liked and bookmarked (catalogue and gallery ids alike). */
export async function fetchTemplateInteractions(): Promise<{
  liked: Set<string>;
  bookmarked: Set<string>;
}> {
  const client = getContractsClient().templateInteractions;
  const [likes, favorites] = await Promise.all([
    client.listMyLikedTemplates().catch(() => null),
    client.listMyFavoriteTemplates().catch(() => null),
  ]);
  return {
    liked: new Set(likes?.status === 200 ? likes.body.liked_ids : []),
    bookmarked: new Set(favorites?.status === 200 ? favorites.body.favorite_ids : []),
  };
}

export async function setTemplateLike(id: string, liked: boolean): Promise<boolean> {
  const client = getContractsClient().templateInteractions;
  try {
    const res = liked
      ? await client.likeTemplate({ params: { id } })
      : await client.unlikeTemplate({ params: { id } });
    return res.status === 200;
  } catch {
    return false;
  }
}

export async function setTemplateBookmark(id: string, bookmarked: boolean): Promise<boolean> {
  const client = getContractsClient().templateInteractions;
  try {
    const res = bookmarked
      ? await client.favoriteTemplate({ params: { id } })
      : await client.unfavoriteTemplate({ params: { id } });
    return res.status === 200;
  } catch {
    return false;
  }
}

/** The user's own Vorlagen („Meine Vorlagen"). */
export async function fetchMyTemplates(): Promise<Template[]> {
  try {
    const res = await getContractsClient().userTemplates.list({ query: {} });
    if (res.status !== 200 || !res.body.success) return [];
    return res.body.data.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description ?? undefined,
      template_type: t.template_type,
      thumbnail_url: getPublicImageUrl(t.preview_image_url ?? undefined),
      external_url: t.external_url ?? undefined,
      tags: t.tags,
    }));
  } catch (error) {
    console.error('[Vorlagen] Failed to fetch own templates:', error);
    return [];
  }
}
