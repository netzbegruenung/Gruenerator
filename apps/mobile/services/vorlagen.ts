import { getContractsClient } from '@gruenerator/shared/api';
import { shareThumbnailPreviewUrl } from '@gruenerator/shared/media-library';
import { resolveStoredImageUrl } from '@gruenerator/shared/media-library/shareUrl';

import { resolveChatUrl } from './chatApiUrl';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://gruenerator.eu/api';

export interface Template {
  id: string;
  title: string;
  description?: string;
  template_type?: string;
  thumbnail_url?: string | null;
  external_url?: string;
  tags?: string[];
}

/**
 * Ein gespeichertes Vorlagenbild ist entweder ein absolutes gecrawltes
 * `og:image` oder die `/share/<token>`-Seiten-URL, die der Web-Dialog beim
 * Hochladen gesichert hat. Für die zweite Sorte muss die Vorschau-Variante her
 * — `API_BASE_URL` enthält das `/api`-Präfix bereits.
 */
export const getPublicImageUrl = (storedUrl: string | undefined): string | null =>
  resolveStoredImageUrl(storedUrl, { baseUrl: API_BASE_URL, width: 400 });

/**
 * Ein Marktplatz-Vorlagenbild: die signierte `/api/thumbs`-Kachel, wenn die API
 * eine mitgibt, sonst die gespeicherte URL wie oben.
 */
export const vorlageImageUri = (
  image: { url: string | null; thumbUrl: string | null },
  width: 400 | 800 = 400
): string | null =>
  image.thumbUrl
    ? resolveChatUrl(shareThumbnailPreviewUrl(image.thumbUrl, width))
    : resolveStoredImageUrl(image.url, { baseUrl: API_BASE_URL, width });

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
