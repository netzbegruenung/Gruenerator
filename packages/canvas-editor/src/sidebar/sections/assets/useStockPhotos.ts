import { STOCK_CATEGORY_LABELS } from '@gruenerator/shared/image-studio';
import { useQuery, type QueryClient } from '@tanstack/react-query';

import { useCanvasEditorServices } from '../../../CanvasEditorProvider';

import type { ElementItem } from './elementTypes';
import type { StockImage, StockImageAttribution } from '../../../common/imageSourceTypes';

const STOCK_PHOTOS_QUERY_KEY = ['canvas', 'stock-photos'] as const;

/**
 * The catalogue tags are English; these let a German query find the photos.
 * Keyed by the catalogue's `category`.
 */
const GERMAN_KEYWORDS: Record<string, readonly string[]> = {
  environment: ['Umwelt', 'Klima', 'Klimaschutz', 'Energie', 'Solar', 'Wind'],
  transport: ['Mobilität', 'Verkehr', 'Bahn', 'Zug', 'Fahrrad', 'Rad', 'Bus', 'Straße'],
  social: ['Gesellschaft', 'Menschen', 'Gemeinschaft', 'Familie', 'Demo'],
  agriculture: ['Landwirtschaft', 'Bauernhof', 'Feld', 'Ernte', 'Acker'],
  nature: ['Natur', 'Wald', 'Baum', 'Wiese', 'Berge', 'Wasser'],
  economy: ['Wirtschaft', 'Arbeit', 'Handwerk', 'Industrie'],
  education: ['Bildung', 'Schule', 'Lernen', 'Kinder'],
  politics: ['Politik', 'Europa', 'Parlament', 'Wahl', 'Demokratie'],
  health: ['Gesundheit', 'Pflege', 'Krankenhaus'],
  housing: ['Wohnen', 'Miete', 'Haus', 'Wohnung'],
  media: ['Medien', 'Presse', 'Nachrichten'],
  urban: ['Stadt', 'Kommune', 'Platz'],
};

function categoryLabel(category: string | undefined): string {
  if (!category) return 'Foto';
  return STOCK_CATEGORY_LABELS[category] ?? GERMAN_KEYWORDS[category]?.[0] ?? 'Foto';
}

/** Only a real Unsplash credit travels with the image; the "Unknown" stub does not. */
function creditOf(image: StockImage): StockImageAttribution | null {
  const a = image.attribution;
  return a && a.profileUrl && a.photoUrl ? a : null;
}

export function stockPhotoItem(image: StockImage): ElementItem {
  const url = `/api/image-picker/stock-image/${encodeURIComponent(image.filename)}`;
  const label = categoryLabel(image.category);
  const credit = creditOf(image);
  const tags = Array.isArray(image.tags)
    ? (image.tags as unknown[]).filter((t) => typeof t === 'string')
    : [];
  return {
    key: `photo:${image.filename}`,
    label,
    keywords: [
      'Foto',
      label,
      ...(credit ? [credit.photographer] : []),
      ...(image.category ? (GERMAN_KEYWORDS[image.category] ?? []) : []),
      ...(tags as string[]),
      image.alt_text ?? '',
    ],
    action: {
      kind: 'media',
      url,
      name: image.alt_text ?? image.filename,
      ...(credit ? { attribution: credit } : {}),
    },
    thumb: { t: 'photo', src: url },
  };
}

/** Unsplash serves resized copies of the same hotlinked URL via imgix's `w`. */
export function unsplashThumbnailUrl(url: string): string {
  try {
    const u = new URL(url);
    u.searchParams.set('w', '400');
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * A live Unsplash search hit as a tile. It is placed by its hotlinked URL —
 * API Terms §6 forbid re-hosting the unaltered photo — and labelled with the
 * photographer, which is the credit Unsplash requires next to the photo.
 */
export function unsplashPhotoItem(image: StockImage): ElementItem {
  const credit = creditOf(image);
  return {
    key: `unsplash:${image.filename}`,
    label: credit ? credit.photographer : 'Unsplash',
    keywords: [],
    action: {
      kind: 'media',
      url: image.url ?? '',
      name: image.alt_text ?? image.filename,
      ...(credit ? { attribution: credit } : {}),
    },
    thumb: { t: 'photo', src: unsplashThumbnailUrl(image.url ?? '') },
  };
}

type FetchStockImages = NonNullable<ReturnType<typeof useCanvasEditorServices>['fetchStockImages']>;

function stockPhotosQuery(fetchStockImages: FetchStockImages) {
  return {
    queryKey: STOCK_PHOTOS_QUERY_KEY,
    queryFn: async () => (await fetchStockImages(null)).images.map(stockPhotoItem),
    staleTime: Infinity,
    gcTime: Infinity,
  };
}

/** The bundled stock photos as tiles; empty where the host offers no catalogue. */
export function useStockPhotos(enabled: boolean) {
  const { fetchStockImages } = useCanvasEditorServices();
  const query = useQuery({
    ...stockPhotosQuery(fetchStockImages ?? (() => Promise.reject(new Error('no catalogue')))),
    enabled: enabled && fetchStockImages !== undefined,
  });
  return { items: query.data ?? [], isLoading: query.isLoading };
}

/** Warm the catalogue before the tab opens, so the Fotos card has its cover. */
export function prefetchStockPhotos(client: QueryClient, fetchStockImages: FetchStockImages) {
  return client.prefetchQuery(stockPhotosQuery(fetchStockImages));
}
